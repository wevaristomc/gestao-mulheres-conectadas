import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import JSZip from "jszip";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO } from "@/lib/rbac-guard";

// -----------------------------------------------------------------------------
// Sincronização Google Drive → Base de Conhecimento
// - `driveSyncVarredura`: percorre a pasta raiz do Drive, faz upsert em
//   `drive_arquivos`. Novo/alterado → status pendente; vídeo → aguardando_selecao.
// - `driveSyncProcessar`: processa até MAX_BATCH pendentes por chamada,
//   extraindo texto conforme o tipo do arquivo. Cria `documentos` + indexa.
// - `driveSyncStatus`: contadores + últimos erros.
// - `driveSyncMarcarTranscricao`: marca vídeos selecionados para transcrever.
// -----------------------------------------------------------------------------

const COORDENACAO = ["coordenador_geral", "administrativo", "coordenador_pedagogico"] as const;

async function assertCoordRole(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(`Falha ao validar permissões: ${error.message}`);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r: string) => (COORDENACAO as readonly string[]).includes(r));
  if (!ok) throw new Response("Forbidden: sem permissão para sincronizar o Drive.", { status: 403 });
}

const MAX_BATCH = 3;
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24MB

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(msg: string): boolean {
  return /\b429\b|rate ?limit|quota|too many requests/i.test(msg);
}

function classificarTipo(mimeType: string, nome: string): string {
  const m = (mimeType || "").toLowerCase();
  const n = (nome || "").toLowerCase();
  if (m === "application/vnd.google-apps.document") return "gdoc";
  if (m === "application/vnd.google-apps.spreadsheet") return "planilha";
  if (m === "application/vnd.google-apps.presentation") return "gdoc";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("audio/") || /\.(mp3|m4a|ogg|wav|webm|aac|flac)$/.test(n)) return "audio";
  if (m.startsWith("video/") || /\.(mp4|mov|mkv|avi|mpeg|webm)$/.test(n)) return "video";
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || n.endsWith(".docx")) return "docx";
  if (m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || n.endsWith(".xlsx") || n.endsWith(".xls")) return "planilha";
  if (m.startsWith("text/") || /\.(txt|md|csv|json|log|xml|html?)$/.test(n)) return "texto";
  return "outro";
}

// ---------------------------------------------------------------------------
// 1) Varredura recursiva (upsert em drive_arquivos)
// ---------------------------------------------------------------------------

export const driveSyncVarredura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async ({ context }) => {
    await assertCoordRole(context);
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const files = await h.listRecursive(root, 5000);

    // Carrega estado atual para saber quais mudaram (evita muitos upserts).
    const { data: existentes } = await admin
      .from("drive_arquivos")
      .select("gdrive_id, modified_time, status, tipo");
    const mapa = new Map<string, { modified_time: string | null; status: string; tipo: string }>();
    for (const r of (existentes ?? []) as Array<{ gdrive_id: string; modified_time: string | null; status: string; tipo: string }>) {
      mapa.set(r.gdrive_id, { modified_time: r.modified_time, status: r.status, tipo: r.tipo });
    }

    let novos = 0, atualizados = 0, inalterados = 0, videosSelecao = 0;
    const rowsUpsert: any[] = [];
    for (const f of files) {
      const tipo = classificarTipo(f.mimeType, f.name);
      const modified = f.modifiedTime ?? null;
      const prev = mapa.get(f.id);
      let status: string;
      if (!prev) {
        novos += 1;
        status = tipo === "video" ? "aguardando_selecao" : "pendente";
        if (status === "aguardando_selecao") videosSelecao += 1;
      } else if (prev.modified_time !== modified) {
        atualizados += 1;
        // vídeo mudou: só re-processa se já estava marcado transcrever
        status = tipo === "video" ? "aguardando_selecao" : "pendente";
      } else {
        inalterados += 1;
        status = prev.status;
      }
      rowsUpsert.push({
        gdrive_id: f.id,
        nome: f.name,
        mime_type: f.mimeType,
        tamanho: f.size ? Number(f.size) : null,
        modified_time: modified,
        pasta_caminho: f.pasta_caminho,
        tipo,
        status,
      });
    }

    // upsert em lotes
    const BATCH = 200;
    for (let i = 0; i < rowsUpsert.length; i += BATCH) {
      const slice = rowsUpsert.slice(i, i + BATCH);
      const { error: upErr } = await admin
        .from("drive_arquivos")
        .upsert(slice, { onConflict: "gdrive_id" });
      if (upErr) throw new Error(`Falha ao gravar drive_arquivos: ${upErr.message}`);
    }

    // registra estado
    const resumo = { total: files.length, novos, atualizados, inalterados, videos_aguardando_selecao: videosSelecao };
    const { data: est } = await admin.from("drive_sync_estado").select("id").limit(1).maybeSingle();
    if (est) {
      await admin
        .from("drive_sync_estado")
        .update({ ultima_varredura: new Date().toISOString(), resumo })
        .eq("id", (est as { id: string }).id);
    } else {
      await admin.from("drive_sync_estado").insert({ ultima_varredura: new Date().toISOString(), resumo });
    }

    return { total: files.length, novos, atualizados, inalterados, videos_aguardando_selecao: videosSelecao };
  });

// ---------------------------------------------------------------------------
// 2) Processamento de um batch de arquivos pendentes
// ---------------------------------------------------------------------------

const ProcessarInput = z.object({ projetoId: z.string().uuid() });

// Helpers de extração de texto
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

async function extrairDocx(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const docXml = zip.file("word/document.xml");
  if (!docXml) return "";
  const xml = await docXml.async("string");
  // Remove tags XML e junta espaços; preserva parágrafos por quebra dupla.
  const semTags = xml
    .replace(/<w:p\b[^>]*>/g, "\n\n")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return semTags.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function extrairXlsx(bytes: Uint8Array): Promise<string> {
  const XLSX: any = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const partes: string[] = [];
  for (const name of wb.SheetNames as string[]) {
    const sheet = wb.Sheets[name];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
    if (!linhas.length) continue;
    partes.push(`## Aba: ${name}`);
    for (const row of linhas) {
      const cols = row.map((c) => (c == null ? "" : String(c))).map((s) => s.replace(/\|/g, "/"));
      partes.push(cols.join(" | "));
    }
    partes.push("");
  }
  return partes.join("\n").trim();
}

function classificarSubtipo(tipo: string, nome: string): { mime: string } | null {
  const n = nome.toLowerCase();
  if (tipo === "imagem") {
    if (n.endsWith(".png")) return { mime: "image/png" };
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return { mime: "image/jpeg" };
    if (n.endsWith(".webp")) return { mime: "image/webp" };
    return { mime: "image/png" };
  }
  return null;
}

async function inserirDocumentoDrive(admin: any, params: {
  projetoId: string;
  userId: string;
  arq: { nome: string; mime_type: string | null; tamanho: number | null; pasta_caminho: string | null; gdrive_id: string };
  conteudo_texto: string;
  webViewLink: string | null;
}): Promise<string> {
  const titulo = params.arq.nome.replace(/\.[^.]+$/, "") || params.arq.nome;
  const payload: Record<string, unknown> = {
    projeto_id: params.projetoId,
    titulo,
    nome: titulo,
    descricao: params.arq.pasta_caminho ? `Drive · ${params.arq.pasta_caminho}` : "Google Drive",
    categoria: "drive",
    tipo: "drive",
    formato: "arquivo",
    origem: "drive_sync",
    nome_arquivo: params.arq.nome,
    mime_type: params.arq.mime_type,
    tamanho_bytes: params.arq.tamanho ?? new TextEncoder().encode(params.conteudo_texto).length,
    conteudo_texto: params.conteudo_texto,
    transcricao_status: "pendente",
    drive_url: params.webViewLink,
    drive_id: params.arq.gdrive_id,
    created_by: params.userId,
    autor_id: params.userId,
    metadata: { drive_id: params.arq.gdrive_id, pasta: params.arq.pasta_caminho },
  };
  let lastError: string | null = null;
  let inserted: { id: string } | null = null;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const res = await admin.from("documentos").insert(payload).select("id").maybeSingle();
    if (!res.error) {
      inserted = res.data as { id: string };
      break;
    }
    lastError = res.error.message;
    const missing =
      res.error.message.match(/Could not find the '([^']+)' column/)?.[1] ||
      res.error.message.match(/column ["']?([^"'\s.]+)["']? does not exist/i)?.[1] ||
      null;
    if (missing && missing in payload) {
      delete payload[missing];
      continue;
    }
    break;
  }
  if (!inserted) throw new Error(`Falha ao registrar documento: ${lastError ?? "erro desconhecido"}`);
  return inserted.id;
}

export const driveSyncProcessar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((v: unknown) => ProcessarInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertCoordRole(context);
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // Seleciona pendentes: status pendente, OU aguardando_selecao com transcrever=true.
    const { data: pend, error: pendErr } = await admin
      .from("drive_arquivos")
      .select("*")
      .or("status.eq.pendente,and(status.eq.aguardando_selecao,transcrever.eq.true)")
      .order("modified_time", { ascending: false })
      .limit(MAX_BATCH);
    if (pendErr) throw new Error(`Falha ao carregar fila: ${pendErr.message}`);
    const fila = (pend ?? []) as Array<any>;

    let processados = 0, erros = 0, ignorados = 0;
    const { executarVisaoRouter, executarTranscricaoRouter } = await import("@/lib/ia.functions");
    const { indexarDocumentoInterno } = await import("@/lib/base-conhecimento.functions");

    for (const arq of fila) {
      const id = arq.id as string;
      const gdriveId = arq.gdrive_id as string;
      const tipo = arq.tipo as string;
      const nome = arq.nome as string;
      await admin.from("drive_arquivos").update({ status: "processando", erro: null }).eq("id", id);
      try {
        let conteudo = "";
        let ignorar = false;

        if (tipo === "gdoc") {
          const meta = await h.getMeta(gdriveId);
          const isSheet = meta.mimeType === "application/vnd.google-apps.spreadsheet";
          const targetMime = isSheet ? "text/csv" : "text/plain";
          const exp = await h.exportGoogleFile(gdriveId, targetMime);
          conteudo = exp.text;
        } else if (tipo === "planilha") {
          const dl = await h.downloadFileBase64(gdriveId);
          conteudo = await extrairXlsx(base64ToBytes(dl.base64));
        } else if (tipo === "docx") {
          const dl = await h.downloadFileBase64(gdriveId);
          conteudo = await extrairDocx(base64ToBytes(dl.base64));
        } else if (tipo === "texto") {
          const dl = await h.downloadFileBase64(gdriveId);
          conteudo = decodeUtf8(base64ToBytes(dl.base64));
        } else if (tipo === "pdf") {
          // Passa o PDF direto ao roteador de visão (Gemini aceita PDF nativo).
          // Limitamos tamanho para não estourar limites do provedor.
          if ((arq.tamanho ?? 0) > 20 * 1024 * 1024) {
            throw new Error("PDF acima de 20MB — divida o arquivo para indexar.");
          }
          const dl = await h.downloadFileBase64(gdriveId);
          const vis = await executarVisaoRouter({
            admin,
            processo: "drive_ocr",
            prompt: "Transcreva integralmente TODO o texto legível deste documento, preservando quebras de parágrafo. Retorne apenas o texto, sem comentários, sem JSON.",
            imagens: [{ mime: "application/pdf", base64: dl.base64 }],
            defaults: { max_tokens: 4096 },
          });
          conteudo = vis.content.trim();
        } else if (tipo === "imagem") {
          const sub = classificarSubtipo(tipo, nome) ?? { mime: "image/png" };
          const dl = await h.downloadFileBase64(gdriveId);
          const vis = await executarVisaoRouter({
            admin,
            processo: "drive_ocr",
            prompt: "Transcreva integralmente TODO o texto legível desta imagem (fotos de documentos, prints, cartazes, whiteboards). Retorne apenas o texto.",
            imagens: [{ mime: sub.mime, base64: dl.base64 }],
            defaults: { max_tokens: 3072 },
          });
          conteudo = vis.content.trim();
        } else if (tipo === "audio") {
          if ((arq.tamanho ?? 0) > MAX_AUDIO_BYTES) {
            throw new Error("Áudio acima de 24MB — compacte antes de indexar.");
          }
          const dl = await h.downloadFileBase64(gdriveId);
          const bytes = base64ToBytes(dl.base64);
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: dl.contentType });
          const t = await executarTranscricaoRouter({
            admin, processo: "drive_transcricao", file: blob, filename: nome, contentType: dl.contentType,
          });
          conteudo = t.text.trim();
        } else if (tipo === "video") {
          if (!arq.transcrever) { ignorar = true; }
          else if ((arq.tamanho ?? 0) > MAX_AUDIO_BYTES) {
            throw new Error("Vídeo acima de 24MB — compactar ou transcrever trecho.");
          } else {
            const dl = await h.downloadFileBase64(gdriveId);
            const bytes = base64ToBytes(dl.base64);
            const blob = new Blob([bytes.buffer as ArrayBuffer], { type: dl.contentType });
            const t = await executarTranscricaoRouter({
              admin, processo: "drive_transcricao", file: blob, filename: nome, contentType: dl.contentType,
            });
            conteudo = t.text.trim();
          }
        } else {
          ignorar = true;
        }

        if (ignorar) {
          await admin
            .from("drive_arquivos")
            .update({ status: "ignorado", processado_em: new Date().toISOString(), erro: "Tipo não suportado para indexação automática." })
            .eq("id", id);
          ignorados += 1;
          continue;
        }

        if (!conteudo || conteudo.length < 20) {
          throw new Error("Nenhum texto extraído do arquivo (conteúdo vazio ou muito curto).");
        }

        const meta = await h.getMeta(gdriveId).catch(() => null);
        const documentoId = await inserirDocumentoDrive(admin, {
          projetoId: data.projetoId,
          userId: context.userId,
          arq: {
            nome,
            mime_type: arq.mime_type ?? null,
            tamanho: arq.tamanho ?? null,
            pasta_caminho: arq.pasta_caminho ?? null,
            gdrive_id: gdriveId,
          },
          conteudo_texto: conteudo,
          webViewLink: meta?.webViewLink ?? null,
        });

        // Indexa nos chunks/embeddings
        try {
          await indexarDocumentoInterno(admin, documentoId);
        } catch (e) {
          // status "erro" já foi gravado na tabela documentos por indexarDocumentoInterno.
          // Ainda assim consideramos o Drive item indexado (documento existe).
          // eslint-disable-next-line no-console
          console.warn("[drive-sync] indexação falhou:", e instanceof Error ? e.message : e);
        }

        await admin
          .from("drive_arquivos")
          .update({ status: "indexado", processado_em: new Date().toISOString(), documento_id: documentoId, erro: null })
          .eq("id", id);
        processados += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 429 do Google Drive / provedores de IA → mantém como pendente para nova tentativa.
        const novoStatus = isRateLimitError(msg) ? "pendente" : "erro";
        await admin
          .from("drive_arquivos")
          .update({
            status: novoStatus,
            erro: msg.slice(0, 800),
            processado_em: new Date().toISOString(),
          })
          .eq("id", id);
        if (novoStatus === "erro") erros += 1;
      }
      // pequeno respiro entre itens (protege quotas do Drive/IA)
      await sleep(300);
    }

    // Restam pendentes?
    const { count } = await admin
      .from("drive_arquivos")
      .select("id", { count: "exact", head: true })
      .or("status.eq.pendente,and(status.eq.aguardando_selecao,transcrever.eq.true)");

    return { processados, erros, ignorados, restantes: count ?? 0 };
  });

// ---------------------------------------------------------------------------
// 3) Status agregado
// ---------------------------------------------------------------------------

export const driveSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: estado } = await admin.from("drive_sync_estado").select("*").limit(1).maybeSingle();

    const { data: porStatus } = await admin
      .from("drive_arquivos")
      .select("status")
      .limit(20000);
    const contadoresStatus: Record<string, number> = {};
    for (const r of (porStatus ?? []) as Array<{ status: string }>) {
      contadoresStatus[r.status] = (contadoresStatus[r.status] ?? 0) + 1;
    }

    const { data: porTipo } = await admin
      .from("drive_arquivos")
      .select("tipo")
      .limit(20000);
    const contadoresTipo: Record<string, number> = {};
    for (const r of (porTipo ?? []) as Array<{ tipo: string }>) {
      contadoresTipo[r.tipo] = (contadoresTipo[r.tipo] ?? 0) + 1;
    }

    const { data: erros } = await admin
      .from("drive_arquivos")
      .select("id, nome, erro, tipo, pasta_caminho, processado_em")
      .eq("status", "erro")
      .order("processado_em", { ascending: false })
      .limit(20);

    const rootConfigured = !!process.env.GDRIVE_ROOT_FOLDER_ID;
    return {
      estado: estado ?? null,
      contadoresStatus,
      contadoresTipo,
      erros: (erros ?? []) as Array<any>,
      rootConfigured,
    };
  });

// ---------------------------------------------------------------------------
// 4) Lista completa (para UI)
// ---------------------------------------------------------------------------

const ListaInput = z.object({
  status: z.string().nullish(),
  tipo: z.string().nullish(),
  busca: z.string().nullish(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const driveSyncLista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((v: unknown) => ListaInput.parse(v))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    let q: any = admin.from("drive_arquivos").select("*").order("atualizado_em", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    if (data.tipo) q = q.eq("tipo", data.tipo);
    if (data.busca && data.busca.trim().length >= 2) {
      const s = data.busca.trim();
      q = q.or(`nome.ilike.%${s}%,pasta_caminho.ilike.%${s}%`);
    }
    q = q.limit(data.limit ?? 200);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// 5) Marca vídeos para transcrever + reindexa item
// ---------------------------------------------------------------------------

const MarcarInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export const driveSyncMarcarTranscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((v: unknown) => MarcarInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertCoordRole(context);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("drive_arquivos")
      .update({ transcrever: true })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, marcados: data.ids.length };
  });

const ReindexInput = z.object({ id: z.string().uuid() });

export const driveSyncReindexar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((v: unknown) => ReindexInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertCoordRole(context);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    // Se já tem documento_id, remove; volta pra pendente.
    const { data: row } = await admin
      .from("drive_arquivos")
      .select("documento_id, tipo")
      .eq("id", data.id)
      .maybeSingle();
    if (row && (row as { documento_id?: string | null }).documento_id) {
      await admin.from("documentos").delete().eq("id", (row as { documento_id: string }).documento_id);
    }
    const proximoStatus = (row as { tipo?: string })?.tipo === "video" ? "aguardando_selecao" : "pendente";
    await admin
      .from("drive_arquivos")
      .update({ status: proximoStatus, erro: null, documento_id: null, processado_em: null })
      .eq("id", data.id);
    return { ok: true };
  });