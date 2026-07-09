import { createServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseChat, tail8 } from "@/lib/whatsapp-parser";
import { executarAiRouter, executarTranscricaoRouter, executarVisaoRouter } from "@/lib/ia.functions";
import { indexarDocumentoInterno } from "@/lib/base-conhecimento.functions";

const BUCKET = "whatsapp";

// -------- Tetos hardcoded (Fase 2b) --------
// Custos de Whisper por minuto — protege o projeto contra faturas surpresa e
// obriga a coordenação a rodar em lotes curados. Discussão detalhada em
// docs/migrations/whatsapp-para-base-conhecimento.sql e no chat da Fase 2.
const MAX_AUDIOS_POR_LOTE = 30;
// Proxy para "≈ 900s de áudio". WhatsApp voice notes são opus mono ~16 kbps,
// então 900s ≈ 1,8 MB; mantemos 4 MB para dar folga a MP3/M4A também. Áudios
// acima disso são pulados com erro claro para revisão manual.
const MAX_BYTES_POR_AUDIO = 4_000_000;

// ---------- Grupos ----------

const CriarGrupoInput = z.object({
  nome: z.string().min(1).max(200),
  projeto_id: z.string().uuid().nullable().optional(),
  turma_id: z.string().uuid().nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
});

export const criarGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CriarGrupoInput.parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("wa_grupos")
      .insert({
        nome: data.nome,
        projeto_id: data.projeto_id ?? null,
        turma_id: data.turma_id ?? null,
        observacoes: data.observacoes ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { grupo: row };
  });

// ---------- Registro de importação já processada no browser ----------

const MensagemPreparadaSchema = z.object({
  timestamp: z.string(),
  remetente_nome: z.string().nullable(),
  remetente_fone_e164: z.string().nullable(),
  tipo: z.enum(["texto", "audio", "imagem", "video", "doc", "sistema"]),
  conteudo_texto: z.string().nullable(),
  midia_nome: z.string().nullable(),
  midia_path: z.string().nullable(),
});

const RegistrarImportacaoInput = z.object({
  grupo_id: z.string().uuid(),
  arquivo_nome: z.string().min(1),
  arquivo_zip_path: z.string().nullable(),
  periodo_inicio: z.string().nullable(),
  periodo_fim: z.string().nullable(),
  total_audios: z.number().int().nonnegative(),
  total_imagens: z.number().int().nonnegative(),
  total_videos: z.number().int().nonnegative(),
  total_remetentes: z.number().int().nonnegative(),
  midias_puladas: z.number().int().nonnegative(),
  mensagens: z.array(MensagemPreparadaSchema).max(200000),
});

/**
 * Registra uma importação já descompactada e com mídias upadas pelo
 * navegador (ver `src/lib/whatsapp-zip-client.ts`). O servidor só faz
 * inserts em lote — sem JSZip, sem download do zip, sem gargalo de RAM.
 */
export const registrarImportacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RegistrarImportacaoInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: imp, error: impErr } = await sb
      .from("wa_importacoes")
      .insert({
        grupo_id: data.grupo_id,
        arquivo_zip_path: data.arquivo_zip_path ?? "",
        arquivo_zip_nome: data.arquivo_nome,
        periodo_inicio: data.periodo_inicio,
        periodo_fim: data.periodo_fim,
        status: "processando",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (impErr || !imp) throw new Error(`Falha ao criar importação: ${impErr?.message ?? "?"}`);
    const importacaoId = imp.id as string;

    for (let i = 0; i < data.mensagens.length; i += 500) {
      const chunk = data.mensagens.slice(i, i + 500).map((r) => ({
        timestamp: r.timestamp,
        remetente_nome: r.remetente_nome,
        remetente_fone_e164: r.remetente_fone_e164,
        tipo: r.tipo,
        conteudo_texto: r.conteudo_texto,
        midia_nome: r.midia_nome,
        midia_path: r.midia_path,
        importacao_id: importacaoId,
        grupo_id: data.grupo_id,
      }));
      const { error } = await sb.from("wa_mensagens").insert(chunk);
      if (error) throw new Error(`Falha ao inserir mensagens: ${error.message}`);
    }

    await sb
      .from("wa_importacoes")
      .update({
        status: "concluido",
        total_mensagens: data.mensagens.length,
        total_audios: data.total_audios,
        total_imagens: data.total_imagens,
        total_videos: data.total_videos,
        total_remetentes: data.total_remetentes,
      })
      .eq("id", importacaoId);

    return {
      importacao_id: importacaoId,
      total_mensagens: data.mensagens.length,
      total_audios: data.total_audios,
      total_imagens: data.total_imagens,
      total_videos: data.total_videos,
      total_remetentes: data.total_remetentes,
      midias_puladas: data.midias_puladas,
      arquivo_zip_path: data.arquivo_zip_path,
    };
  });

// ---------- Importação: processa o zip já upado no bucket ----------

const ProcessarZipInput = z.object({
  grupo_id: z.string().uuid(),
  storage_path: z.string().min(1), // ex: imports/<uuid>/original.zip
  arquivo_nome: z.string().min(1),
});

type Insercao = {
  timestamp: string;
  remetente_nome: string | null;
  remetente_fone_e164: string | null;
  tipo: string;
  conteudo_texto: string | null;
  midia_path: string | null;
  midia_nome: string | null;
};

export const processarZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ProcessarZipInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // 1) baixa o zip
    const dl = await sb.storage.from(BUCKET).download(data.storage_path);
    if (dl.error || !dl.data) throw new Error(`Falha ao baixar zip: ${dl.error?.message ?? "?"}`);
    const buf = await dl.data.arrayBuffer();

    // 2) parseia e sobe mídias
    const zip = await JSZip.loadAsync(buf);
    let chatText: string | null = null;
    const mediaEntries: Record<string, JSZip.JSZipObject> = {};
    zip.forEach((relPath, entry) => {
      if (entry.dir) return;
      const base = relPath.split("/").pop() ?? relPath;
      if (/^_?chat\.txt$/i.test(base) || base.toLowerCase() === "chat.txt") {
        // pega o maior _chat.txt (algumas exportações têm múltiplos)
        chatText = null; // marcador — vamos ler depois
      }
      mediaEntries[base] = entry;
    });

    // Ler _chat.txt (prioriza esse nome; senão qualquer .txt maior que 200 bytes)
    const chatCandidate = Object.entries(mediaEntries).find(([n]) => /^_?chat\.txt$/i.test(n));
    if (chatCandidate) {
      chatText = await chatCandidate[1].async("string");
    } else {
      const txts: Array<[string, JSZip.JSZipObject]> = Object.entries(mediaEntries).filter(([n]) =>
        n.toLowerCase().endsWith(".txt"),
      );
      let best: string | null = null;
      for (const [, e] of txts) {
        const s = await e.async("string");
        if (s.length > (best?.length ?? 0)) best = s;
      }
      chatText = best;
    }
    if (!chatText) throw new Error("_chat.txt não encontrado dentro do zip.");

    const parsed = parseChat(chatText);

    // 3) cria linha de importação
    const { data: imp, error: impErr } = await sb
      .from("wa_importacoes")
      .insert({
        grupo_id: data.grupo_id,
        arquivo_zip_path: data.storage_path,
        arquivo_zip_nome: data.arquivo_nome,
        periodo_inicio: parsed.periodo_inicio,
        periodo_fim: parsed.periodo_fim,
        status: "processando",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (impErr || !imp) throw new Error(`Falha ao criar importação: ${impErr?.message ?? "?"}`);
    const importacaoId = imp.id as string;

    // 4) upload das mídias referenciadas (só as citadas nas mensagens)
    const rows: Insercao[] = [];
    let audios = 0, imagens = 0, videos = 0;
    const remetentes = new Set<string>();

    for (const m of parsed.mensagens) {
      let midia_path: string | null = null;
      if (m.midia_nome) {
        const entry = mediaEntries[m.midia_nome];
        if (entry) {
          const bytes = await entry.async("uint8array");
          const objectPath = `imports/${importacaoId}/media/${m.midia_nome}`;
          const up = await sb.storage.from(BUCKET).upload(objectPath, bytes, {
            upsert: true,
            contentType: guessContentType(m.midia_nome),
          });
          if (!up.error) midia_path = objectPath;
        }
      }
      if (m.tipo === "audio") audios++;
      if (m.tipo === "imagem") imagens++;
      if (m.tipo === "video") videos++;
      if (m.remetente_fone_e164) remetentes.add(m.remetente_fone_e164);
      rows.push({
        timestamp: m.timestamp,
        remetente_nome: m.remetente_nome,
        remetente_fone_e164: m.remetente_fone_e164,
        tipo: m.tipo,
        conteudo_texto: m.conteudo_texto,
        midia_path,
        midia_nome: m.midia_nome,
      });
    }

    // 5) insere mensagens em lote (chunks de 500)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({
        ...r,
        importacao_id: importacaoId,
        grupo_id: data.grupo_id,
      }));
      const { error } = await sb.from("wa_mensagens").insert(chunk);
      if (error) throw new Error(`Falha ao inserir mensagens: ${error.message}`);
    }

    // 6) atualiza contadores + status
    await sb
      .from("wa_importacoes")
      .update({
        status: "concluido",
        total_mensagens: rows.length,
        total_audios: audios,
        total_imagens: imagens,
        total_videos: videos,
        total_remetentes: remetentes.size,
      })
      .eq("id", importacaoId);

    return {
      importacao_id: importacaoId,
      total_mensagens: rows.length,
      total_audios: audios,
      total_imagens: imagens,
      total_videos: videos,
      total_remetentes: remetentes.size,
    };
  });

function guessContentType(nome: string): string {
  const n = nome.toLowerCase();
  if (n.endsWith(".opus")) return "audio/ogg";
  if (n.endsWith(".ogg")) return "audio/ogg";
  if (n.endsWith(".m4a")) return "audio/mp4";
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

// ---------- Preview: quantos áudios pendentes / já transcritos ----------

const StatusAudiosInput = z.object({ importacao_id: z.string().uuid() });

export const statusAudios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => StatusAudiosInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: msgs, error } = await sb
      .from("wa_mensagens")
      .select("id")
      .eq("importacao_id", data.importacao_id)
      .eq("tipo", "audio")
      .not("midia_path", "is", null);
    if (error) throw new Error(error.message);
    const ids = (msgs ?? []).map((m: { id: string }) => m.id);
    if (!ids.length) {
      return { total: 0, transcritos: 0, pendentes: 0, publicados: 0, publicaveis: 0 };
    }

    const { data: analises } = await sb
      .from("wa_midias_analise")
      .select("mensagem_id, transcricao, erro")
      .in("mensagem_id", ids)
      .eq("tipo_analise", "transcricao");
    const transcritos = new Set(
      (analises ?? [])
        .filter((a: { transcricao?: string | null; erro?: string | null }) => a.transcricao && !a.erro)
        .map((a: { mensagem_id: string }) => a.mensagem_id),
    );

    // documentos já publicados que apontam para uma dessas mensagens
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: docs } = await admin
      .from("documentos")
      .select("wa_mensagem_id")
      .in("wa_mensagem_id", ids);
    const publicados = new Set(
      (docs ?? [])
        .map((d: { wa_mensagem_id?: string | null }) => d.wa_mensagem_id)
        .filter((v: string | null | undefined): v is string => !!v),
    );

    const publicaveis = Array.from(transcritos).filter((id) => !publicados.has(id)).length;
    return {
      total: ids.length,
      transcritos: transcritos.size,
      pendentes: ids.length - transcritos.size,
      publicados: publicados.size,
      publicaveis,
    };
  });

// ---------- Transcrição de áudios ----------

const TranscreverInput = z.object({ importacao_id: z.string().uuid() });

export const transcreverAudios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => TranscreverInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: msgs, error } = await sb
      .from("wa_mensagens")
      .select("id, midia_path, midia_nome")
      .eq("importacao_id", data.importacao_id)
      .eq("tipo", "audio")
      .not("midia_path", "is", null);
    if (error) throw new Error(error.message);

    let ok = 0, fail = 0, pulados_tamanho = 0, processados = 0;
    for (const m of msgs ?? []) {
      if (processados >= MAX_AUDIOS_POR_LOTE) break;
      // Pula se já tem análise
      const { data: existente } = await sb
        .from("wa_midias_analise")
        .select("id, transcricao, erro")
        .eq("mensagem_id", m.id)
        .eq("tipo_analise", "transcricao")
        .maybeSingle();
      if (existente && existente.transcricao && !existente.erro) { ok++; continue; }

      try {
        const dl = await sb.storage.from(BUCKET).download(m.midia_path as string);
        if (dl.error || !dl.data) throw new Error(`storage: ${dl.error?.message ?? "?"}`);
        const bytes = new Uint8Array(await dl.data.arrayBuffer());

        if (bytes.length > MAX_BYTES_POR_AUDIO) {
          await sb.from("wa_midias_analise").upsert(
            {
              mensagem_id: m.id,
              tipo_analise: "transcricao",
              erro: `áudio acima do teto por arquivo (${Math.round(bytes.length / 1024)} KB > ${Math.round(MAX_BYTES_POR_AUDIO / 1024)} KB, ≈ 15 min). Divida antes de transcrever.`,
            },
            { onConflict: "mensagem_id,tipo_analise" },
          );
          pulados_tamanho++;
          processados++;
          continue;
        }

        const nome = m.midia_nome ?? "audio.opus";
        const contentType = guessContentType(nome);
        const file = new File([bytes], nome, { type: contentType });

        const r = await executarTranscricaoRouter({
          admin,
          processo: "transcricao_audio",
          file,
          filename: nome,
          contentType,
        });
        const texto = r.text;

        await sb.from("wa_midias_analise").upsert(
          {
            mensagem_id: m.id,
            tipo_analise: "transcricao",
            transcricao: texto || null,
            modelo: `${r.provedor}/${r.modelo}`,
            tokens_in: null,
            tokens_out: null,
            erro: null,
          },
          { onConflict: "mensagem_id,tipo_analise" },
        );
        if (texto) {
          await sb
            .from("wa_mensagens")
            .update({ conteudo_texto: `[áudio] ${texto}` })
            .eq("id", m.id);
        }
        ok++;
        processados++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sb.from("wa_midias_analise").upsert(
          { mensagem_id: m.id, tipo_analise: "transcricao", erro: msg.slice(0, 500) },
          { onConflict: "mensagem_id,tipo_analise" },
        );
        fail++;
        processados++;
      }
    }
    const total = (msgs ?? []).length;
    const restantes = Math.max(0, total - ok - fail - pulados_tamanho);
    return {
      ok,
      fail,
      pulados_tamanho,
      total,
      processados,
      restantes,
      max_por_lote: MAX_AUDIOS_POR_LOTE,
    };
  });

// ---------- Publicar áudios transcritos na Base de Conhecimento ----------

const PublicarAudiosInput = z.object({
  importacao_id: z.string().uuid(),
  mensagem_ids: z.array(z.string().uuid()).max(200).optional(),
});

export const publicarAudiosNaBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PublicarAudiosInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // 1) importação → grupo → projeto
    const { data: imp, error: impErr } = await sb
      .from("wa_importacoes")
      .select("id, grupo_id, arquivo_zip_nome")
      .eq("id", data.importacao_id)
      .maybeSingle();
    if (impErr) throw new Error(impErr.message);
    if (!imp) throw new Error("Importação não encontrada.");

    const { data: grupo, error: grErr } = await sb
      .from("wa_grupos")
      .select("id, nome, projeto_id")
      .eq("id", imp.grupo_id as string)
      .maybeSingle();
    if (grErr) throw new Error(grErr.message);
    if (!grupo?.projeto_id) {
      throw new Error(
        "Grupo do WhatsApp sem projeto vinculado. Edite o grupo e defina o projeto antes de publicar na Base de Conhecimento.",
      );
    }
    const projetoId = grupo.projeto_id as string;

    // 2) valida acesso ao projeto
    const { data: roles, error: roleErr } = await sb
      .from("user_roles")
      .select("role, projeto_id")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(`Falha ao validar permissões: ${roleErr.message}`);
    const canUseProject = (roles ?? []).some(
      (r: { projeto_id?: string | null }) => r.projeto_id === projetoId || r.projeto_id == null,
    );
    if (!canUseProject) {
      throw new Response("Forbidden: usuário sem vínculo com o projeto do grupo.", { status: 403 });
    }

    // 3) coleta candidatos: áudios com transcrição concluída sem documento publicado
    let msgsQ = sb
      .from("wa_mensagens")
      .select("id, midia_path, midia_nome, remetente_nome, remetente_fone_e164, timestamp")
      .eq("importacao_id", data.importacao_id)
      .eq("tipo", "audio")
      .not("midia_path", "is", null);
    if (data.mensagem_ids && data.mensagem_ids.length) {
      msgsQ = msgsQ.in("id", data.mensagem_ids);
    }
    const { data: msgs, error: msgErr } = await msgsQ;
    if (msgErr) throw new Error(msgErr.message);
    const msgList = (msgs ?? []) as Array<{
      id: string; midia_path: string | null; midia_nome: string | null;
      remetente_nome: string | null; remetente_fone_e164: string | null; timestamp: string;
    }>;
    if (!msgList.length) {
      return { publicados: 0, pulados: 0, erros: [] as string[], projeto_id: projetoId };
    }

    const ids = msgList.map((m) => m.id);
    const { data: analises } = await sb
      .from("wa_midias_analise")
      .select("mensagem_id, transcricao, erro")
      .in("mensagem_id", ids)
      .eq("tipo_analise", "transcricao");
    const transcMap = new Map<string, string>();
    for (const a of (analises ?? []) as Array<{ mensagem_id: string; transcricao: string | null; erro: string | null }>) {
      if (a.transcricao && !a.erro) transcMap.set(a.mensagem_id, a.transcricao);
    }

    // já publicados
    const { data: docsExist } = await admin
      .from("documentos")
      .select("id, wa_mensagem_id")
      .in("wa_mensagem_id", ids);
    const jaPublicados = new Set(
      (docsExist ?? [])
        .map((d: { wa_mensagem_id?: string | null }) => d.wa_mensagem_id)
        .filter((v: string | null | undefined): v is string => !!v),
    );

    // 4) publica cada candidato
    let publicados = 0;
    let pulados = 0;
    const erros: string[] = [];
    const grupoNome = (grupo.nome as string | null) ?? "Grupo WhatsApp";

    for (const m of msgList) {
      if (jaPublicados.has(m.id)) { pulados++; continue; }
      const transcricao = transcMap.get(m.id);
      if (!transcricao) { pulados++; continue; }

      const data_iso = m.timestamp ? new Date(m.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      const remetente = m.remetente_nome ?? m.remetente_fone_e164 ?? "?";
      const titulo = `Áudio · ${grupoNome} · ${remetente} · ${data_iso || m.timestamp}`.slice(0, 300);
      const cabecalho = [
        `Grupo: ${grupoNome}`,
        `Remetente: ${remetente}${m.remetente_fone_e164 ? ` (${m.remetente_fone_e164})` : ""}`,
        `Data/hora: ${data_iso || m.timestamp}`,
        `Arquivo: ${m.midia_nome ?? "—"}`,
      ].join("\n");
      const conteudo = `${cabecalho}\n\nTranscrição:\n${transcricao}`;

      const payload: Record<string, unknown> = {
        projeto_id: projetoId,
        titulo,
        nome: titulo,
        descricao: transcricao.slice(0, 400),
        categoria: "audios_whatsapp",
        tipo: "audios_whatsapp",
        formato: "audio",
        origem: "whatsapp",
        conteudo_texto: conteudo,
        transcricao_status: "concluida",
        storage_path: m.midia_path,
        nome_arquivo: m.midia_nome,
        mime_type: m.midia_nome ? guessContentType(m.midia_nome) : "audio/ogg",
        tags: ["whatsapp", "audio"],
        metadata: {
          wa_mensagem_id: m.id,
          wa_importacao_id: data.importacao_id,
          wa_grupo_id: grupo.id,
          remetente,
          remetente_fone: m.remetente_fone_e164,
          timestamp: m.timestamp,
        },
        wa_mensagem_id: m.id,
        created_by: context.userId,
        autor_id: context.userId,
      };

      // Descoberta de colunas: mesmo padrão de criarAnotacao. Tolera schemas
      // que ainda não tenham uma coluna secundária (nome, autor_id, etc.).
      let inserted: { id: string } | null = null;
      let lastError: string | null = null;
      for (let attempt = 0; attempt < 14; attempt += 1) {
        const res = await admin.from("documentos").insert(payload).select("id").maybeSingle();
        if (!res.error) { inserted = res.data as { id: string }; break; }
        lastError = res.error.message;
        const missing =
          res.error.message.match(/Could not find the '([^']+)' column/)?.[1] ||
          res.error.message.match(/column ["']?([^"'\s.]+)["']? does not exist/i)?.[1] ||
          null;
        if (missing && missing in payload) { delete payload[missing]; continue; }
        break;
      }
      if (!inserted) {
        erros.push(`msg ${m.id.slice(0, 8)}: ${lastError ?? "erro desconhecido"}`);
        continue;
      }

      try {
        await indexarDocumentoInterno(admin, inserted.id);
        publicados++;
      } catch (e) {
        // status "erro" já foi gravado; considera publicado (o documento existe) mas registra ruído
        publicados++;
        erros.push(`msg ${m.id.slice(0, 8)}: indexação falhou — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 5) notificação dedupada por dia
    if (publicados > 0) {
      const hoje = new Date().toISOString().slice(0, 10);
      const chave = `wa_publicar_${data.importacao_id}_${hoje}`;
      await sb.from("notificacoes").upsert(
        {
          user_id: context.userId,
          tipo: "whatsapp_audios_publicados",
          severidade: "info",
          titulo: `${publicados} áudio(s) publicados na Base de Conhecimento`,
          corpo: `Grupo ${grupoNome} — importação ${data.importacao_id.slice(0, 8)}. ${pulados > 0 ? `${pulados} já estavam publicados ou sem transcrição.` : ""}`,
          link_rota: "/base-conhecimento",
          origem: "whatsapp",
          chave_dedup: chave,
        },
        { onConflict: "chave_dedup" },
      );
    }

    return { publicados, pulados, erros, projeto_id: projetoId };
  });

// ---------- Análise de imagens ----------

const AnalisarImgInput = z.object({ importacao_id: z.string().uuid() });

export const analisarImagens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => AnalisarImgInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: msgs, error } = await sb
      .from("wa_mensagens")
      .select("id, midia_path")
      .eq("importacao_id", data.importacao_id)
      .eq("tipo", "imagem")
      .not("midia_path", "is", null);
    if (error) throw new Error(error.message);

    let ok = 0, fail = 0;
    for (const m of msgs ?? []) {
      const { data: existente } = await sb
        .from("wa_midias_analise")
        .select("id, ocr_texto, erro")
        .eq("mensagem_id", m.id)
        .eq("tipo_analise", "imagem")
        .maybeSingle();
      if (existente && (existente.ocr_texto || existente.erro)) { ok++; continue; }

      try {
        // Baixa a imagem e converte para base64 (o roteador BYOK aceita todos os
        // provedores nesse formato: Gemini inline_data, Anthropic base64, OpenAI-compat data URL).
        const dl = await sb.storage.from(BUCKET).download(m.midia_path as string);
        if (dl.error || !dl.data) throw new Error(`storage: ${dl.error?.message ?? "?"}`);
        const bytes = new Uint8Array(await dl.data.arrayBuffer());
        let b64 = "";
        // btoa aceita string; converte via chunks para evitar estouro de stack.
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          b64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
        }
        b64 = btoa(b64);
        const mime = (dl.data as Blob).type || "image/jpeg";

        const prompt =
          "Analise esta imagem enviada em um grupo de WhatsApp de um projeto social no Brasil. Responda em JSON válido com as chaves:\n" +
          "  \"ocr_texto\": todo texto legível na imagem, transcrito literalmente (ou vazio);\n" +
          "  \"descricao\": 1-2 frases descrevendo objetivamente o que está na imagem;\n" +
          "  \"tipo_provavel\": um destes → \"lista_presenca\" | \"cartaz\" | \"comprovante\" | \"foto_aula\" | \"documento\" | \"outro\".\n" +
          "Não invente. Sem markdown, sem comentários — apenas o JSON.";

        const r = await executarVisaoRouter({
          admin,
          processo: "analise_imagem",
          prompt,
          imagens: [{ mime, base64: b64 }],
          defaults: { max_tokens: 800 },
        });
        const raw = r.content;
        const parsed = safeJson(raw);

        await sb.from("wa_midias_analise").upsert(
          {
            mensagem_id: m.id,
            tipo_analise: "imagem",
            ocr_texto: parsed?.ocr_texto ?? null,
            descricao_ia: parsed?.descricao ?? raw.slice(0, 2000),
            tipo_provavel: parsed?.tipo_provavel ?? null,
            modelo: `${r.provedor}/${r.modelo}`,
            tokens_in: r.tokens_entrada ?? null,
            tokens_out: r.tokens_saida ?? null,
            erro: null,
          },
          { onConflict: "mensagem_id,tipo_analise" },
        );
        ok++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sb.from("wa_midias_analise").upsert(
          { mensagem_id: m.id, tipo_analise: "imagem", erro: msg.slice(0, 500) },
          { onConflict: "mensagem_id,tipo_analise" },
        );
        fail++;
      }
    }
    return { ok, fail, total: (msgs ?? []).length };
  });

function safeJson(raw: string): { ocr_texto?: string; descricao?: string; tipo_provavel?: string } | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "");
  try { return JSON.parse(cleaned); } catch { /* try to find first {..} */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } }
  return null;
}

// ---------- Vínculo telefone → beneficiária ----------

const RemetentesInput = z.object({ importacao_id: z.string().uuid() });

export const listarRemetentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RemetentesInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: rows, error } = await sb
      .from("wa_mensagens")
      .select("remetente_fone_e164, remetente_nome, beneficiaria_id")
      .eq("importacao_id", data.importacao_id)
      .not("remetente_fone_e164", "is", null);
    if (error) throw new Error(error.message);

    const agg = new Map<
      string,
      { fone: string; nome: string | null; count: number; beneficiaria_id: string | null }
    >();
    for (const r of rows ?? []) {
      const key = r.remetente_fone_e164 as string;
      const cur = agg.get(key);
      if (cur) {
        cur.count++;
        if (!cur.nome && r.remetente_nome) cur.nome = r.remetente_nome;
        if (!cur.beneficiaria_id && r.beneficiaria_id) cur.beneficiaria_id = r.beneficiaria_id as string;
      } else {
        agg.set(key, {
          fone: key,
          nome: (r.remetente_nome as string | null) ?? null,
          count: 1,
          beneficiaria_id: (r.beneficiaria_id as string | null) ?? null,
        });
      }
    }
    const remetentes = Array.from(agg.values()).sort((a, b) => b.count - a.count);

    // Tenta casar automaticamente com beneficiárias (por tail8 do telefone)
    const { data: benefs } = await sb
      .from("beneficiarias")
      .select("id, nome, cpf, telefone");
    const bMap = new Map<string, { id: string; nome: string }>();
    for (const b of benefs ?? []) {
      const t = tail8(b.telefone as string | null);
      if (t) bMap.set(t, { id: b.id as string, nome: b.nome as string });
    }
    const auto = remetentes.map((r) => {
      const t = tail8(r.fone);
      const match = t ? bMap.get(t) : null;
      return { ...r, sugestao: match ?? null };
    });
    return { remetentes: auto };
  });

const VincularInput = z.object({
  importacao_id: z.string().uuid(),
  fone_e164: z.string().min(4),
  beneficiaria_id: z.string().uuid(),
  atualizar_cadastro: z.boolean().default(true),
});

export const vincularRemetente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => VincularInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // 1) marca todas as mensagens desse fone no grupo/importação
    const { error: upErr } = await sb
      .from("wa_mensagens")
      .update({ beneficiaria_id: data.beneficiaria_id })
      .eq("importacao_id", data.importacao_id)
      .eq("remetente_fone_e164", data.fone_e164);
    if (upErr) throw new Error(upErr.message);

    // 2) grava/atualiza wa_contatos
    await sb.from("wa_contatos").upsert(
      { fone_e164: data.fone_e164, beneficiaria_id: data.beneficiaria_id, projeto_id: null },
      { onConflict: "fone_e164,projeto_id" },
    );

    // 3) atualiza telefone da beneficiária se estiver vazio
    if (data.atualizar_cadastro) {
      const { data: b } = await sb
        .from("beneficiarias")
        .select("telefone")
        .eq("id", data.beneficiaria_id)
        .maybeSingle();
      if (b && (!b.telefone || String(b.telefone).trim() === "")) {
        await sb.from("beneficiarias").update({ telefone: data.fone_e164 }).eq("id", data.beneficiaria_id);
      }
    }
    return { ok: true };
  });

// ---------- Resumo IA por período ----------

const ResumoInput = z.object({
  grupo_id: z.string().uuid(),
  inicio: z.string(), // ISO
  fim: z.string(),
});

export const gerarResumoGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ResumoInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: msgs, error } = await sb
      .from("wa_mensagens")
      .select("timestamp, remetente_nome, tipo, conteudo_texto")
      .eq("grupo_id", data.grupo_id)
      .gte("timestamp", data.inicio)
      .lte("timestamp", data.fim)
      .order("timestamp", { ascending: true })
      .limit(4000);
    if (error) throw new Error(error.message);

    // Junta OCRs
    const idsImg = (msgs ?? [])
      .map((_, i) => i)
      .filter((i) => (msgs ?? [])[i].tipo === "imagem");
    // Concatena, limitando a 12k chars
    const linhas: string[] = [];
    for (const m of msgs ?? []) {
      if (!m.conteudo_texto) continue;
      const who = (m.remetente_nome ?? "?").slice(0, 40);
      const ts = String(m.timestamp).slice(0, 16).replace("T", " ");
      linhas.push(`[${ts}] ${who}: ${m.conteudo_texto}`);
    }
    void idsImg;
    let contexto = linhas.join("\n");
    if (contexto.length > 12_000) contexto = contexto.slice(-12_000);

    const prompt = `Você é um analista sênior de projetos sociais no Brasil. Vou te enviar mensagens de um grupo de WhatsApp de coordenação/turma do projeto.

Período: ${data.inicio} até ${data.fim}

Mensagens (texto + transcrições de áudio já embutidas):
"""
${contexto || "(sem mensagens no período)"}
"""

Escreva em português, em Markdown, uma **prévia de relatório para a coordenação**, com as seções (nesta ordem, use ##):
1. **Temas recorrentes**
2. **Menções a presença/faltas/atraso**
3. **Dúvidas frequentes das cursistas**
4. **Alertas** (sinais de evasão, conflito, questões sensíveis ou de proteção)
5. **Sugestões acionáveis para a coordenação**

Nunca invente números. Se um dado não estiver claro, registre a lacuna.`;

    const r = await executarAiRouter({
      admin,
      processo: "resumo_whatsapp",
      mensagens: [{ role: "user", content: prompt }],
      defaults: { max_tokens: 2000, temperatura: 0.4 },
    });
    const text = r.content;

    const { data: saved, error: sErr } = await sb
      .from("wa_resumos")
      .insert({
        grupo_id: data.grupo_id,
        data_inicio: data.inicio,
        data_fim: data.fim,
        markdown: text,
        autor_ia: `${r.provedor}/${r.modelo}`,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (sErr) throw new Error(sErr.message);
    return { resumo: saved, markdown: text };
  });

// ---------- Purga ----------

const PurgarInput = z.object({ importacao_id: z.string().uuid() });

export const purgarImportacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PurgarInput.parse(v))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: imp } = await sb
      .from("wa_importacoes")
      .select("id, arquivo_zip_path")
      .eq("id", data.importacao_id)
      .maybeSingle();
    // Lista arquivos do folder
    const folder = `imports/${data.importacao_id}`;
    const { data: files } = await sb.storage.from(BUCKET).list(`${folder}/media`);
    const paths: string[] = [];
    for (const f of files ?? []) paths.push(`${folder}/media/${f.name}`);
    if (imp?.arquivo_zip_path) paths.push(imp.arquivo_zip_path as string);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    await sb.from("wa_importacoes").delete().eq("id", data.importacao_id);
    return { ok: true, removidos: paths.length };
  });