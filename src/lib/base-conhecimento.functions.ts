import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO_E_FINANCEIRO } from "@/lib/rbac-guard";

const RegisterDocumentoInput = z.object({
  projetoId: z.string().uuid(),
  titulo: z.string().min(1).max(300),
  descricao: z.string().nullable().optional(),
  categoria: z.string().min(1).max(80),
  storagePath: z.string().min(1).max(600),
  nomeArquivo: z.string().min(1).max(300),
  mimeType: z.string().nullable().optional(),
  tamanhoBytes: z.number().int().nonnegative(),
});

const DeleteDocumentoInput = z.object({
  id: z.string().uuid(),
});

const CriarAnotacaoInput = z.object({
  projetoId: z.string().uuid(),
  titulo: z.string().min(1).max(300),
  categoria: z.string().min(1).max(80).default("anotacoes"),
  corpo: z.string().min(1),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

const IndexarInput = z.object({ documentoId: z.string().uuid() });

const BuscarInput = z.object({
  projetoId: z.string().uuid(),
  query: z.string().min(2),
  k: z.number().int().min(1).max(30).optional(),
  categorias: z.array(z.string()).optional(),
});

export const registerUploadedDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((v: unknown) => RegisterDocumentoInput.parse(v))
  .handler(async ({ data, context }) => {
    const missingColumn = (message: string): string | null => (
      message.match(/Could not find the '([^']+)' column/)?.[1] ||
      message.match(/column ["']?([^"'\s.]+)["']? does not exist/i)?.[1] ||
      null
    );

    const normalizedPrefix = `${data.projetoId}/`;
    if (!data.storagePath.startsWith(normalizedPrefix)) {
      throw new Error("Caminho de arquivo inválido para o projeto selecionado.");
    }

    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role, projeto_id")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(`Falha ao validar permissões: ${roleError.message}`);

    const canUseProject = (roles ?? []).some((row: { projeto_id?: string | null }) => row.projeto_id === data.projetoId || row.projeto_id == null);
    if (!canUseProject) {
      throw new Response("Forbidden: usuário sem vínculo com o projeto selecionado.", { status: 403 });
    }

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const payload: Record<string, unknown> = {
      projeto_id: data.projetoId,
      titulo: data.titulo,
      nome: data.titulo,
      descricao: data.descricao ?? null,
      categoria: data.categoria,
      tipo: data.categoria,
      storage_path: data.storagePath,
      nome_arquivo: data.nomeArquivo,
      mime_type: data.mimeType ?? null,
      tamanho_bytes: data.tamanhoBytes,
      created_by: context.userId,
      autor_id: context.userId,
    };

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const inserted = await admin.from("documentos").insert(payload).select("*").maybeSingle();
      if (!inserted.error) return { ok: true, row: inserted.data ?? payload };

      lastError = inserted.error.message;
      const missing = missingColumn(inserted.error.message);
      if (missing && missing in payload) {
        delete payload[missing];
        continue;
      }
      break;
    }

    await admin.storage.from("documentos").remove([data.storagePath]);
    throw new Error(`Arquivo enviado, mas não foi possível registrar na Base de Conhecimento: ${lastError ?? "erro desconhecido"}`);
  });

export const deleteDocumentoById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((v: unknown) => DeleteDocumentoInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: row, error: readError } = await admin
      .from("documentos")
      .select("id, projeto_id, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(`Falha ao localizar documento: ${readError.message}`);
    if (!row) throw new Error("Documento não encontrado.");

    const projetoId = (row as { projeto_id?: string | null }).projeto_id ?? null;
    const storagePath = (row as { storage_path?: string | null }).storage_path ?? null;

    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role, projeto_id")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(`Falha ao validar permissões: ${roleError.message}`);

    const canUseProject = (roles ?? []).some((r: { projeto_id?: string | null }) => r.projeto_id === projetoId || r.projeto_id == null);
    if (!canUseProject) {
      throw new Response("Forbidden: usuário sem vínculo com o projeto do documento.", { status: 403 });
    }

    const { error: delError } = await admin.from("documentos").delete().eq("id", data.id);
    if (delError) throw new Error(`Falha ao remover registro: ${delError.message}`);

    if (storagePath) {
      await admin.storage.from("documentos").remove([storagePath]);
    }

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Anotações livres — corpo de texto vai para conteudo_texto e é indexado.
// ---------------------------------------------------------------------------

async function validarAcessoProjeto(supabase: any, userId: string, projetoId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role, projeto_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao validar permissões: ${error.message}`);
  const ok = (roles ?? []).some((r: { projeto_id?: string | null }) =>
    r.projeto_id === projetoId || r.projeto_id == null,
  );
  if (!ok) throw new Response("Forbidden: usuário sem vínculo com o projeto.", { status: 403 });
}

export async function indexarDocumentoInterno(admin: any, documentoId: string): Promise<{ chunks: number; status: string }> {
  const { data: doc, error: readError } = await admin
    .from("documentos")
    .select("id, projeto_id, conteudo_texto, titulo, nome, descricao")
    .eq("id", documentoId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!doc) throw new Error("Documento não encontrado.");

  const texto = String(doc.conteudo_texto ?? "").trim();
  if (!texto) {
    await admin.from("documentos").update({ transcricao_status: "nao_aplicavel" }).eq("id", documentoId);
    return { chunks: 0, status: "nao_aplicavel" };
  }

  await admin.from("documentos").update({ transcricao_status: "processando" }).eq("id", documentoId);
  await admin.from("documentos_chunks").delete().eq("documento_id", documentoId);

  try {
    const { chunkTexto, embedTextos, vetorToLiteral } = await import("@/lib/base-conhecimento-embed.server");
    const cabecalho = [doc.titulo ?? doc.nome, doc.descricao].filter(Boolean).join(" — ");
    const chunks = chunkTexto(cabecalho ? `${cabecalho}\n\n${texto}` : texto);
    if (chunks.length === 0) {
      await admin.from("documentos").update({ transcricao_status: "nao_aplicavel" }).eq("id", documentoId);
      return { chunks: 0, status: "nao_aplicavel" };
    }

    // batches de 32 para respeitar limites de contexto do provedor
    const BATCH = 32;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vetores = await embedTextos(slice);
      const rows = slice.map((texto, idx) => ({
        documento_id: documentoId,
        projeto_id: doc.projeto_id,
        ordem: i + idx,
        texto,
        tokens: Math.ceil(texto.length / 4),
        embedding: vetores[idx] ? vetorToLiteral(vetores[idx]) : null,
      }));
      const { error: insError } = await admin.from("documentos_chunks").insert(rows);
      if (insError) throw new Error(insError.message);
    }

    await admin.from("documentos").update({ transcricao_status: "concluida" }).eq("id", documentoId);
    return { chunks: chunks.length, status: "concluida" };
  } catch (e) {
    await admin
      .from("documentos")
      .update({ transcricao_status: "erro", metadata: { erro_indexacao: e instanceof Error ? e.message : String(e) } })
      .eq("id", documentoId);
    throw e;
  }
}

export const criarAnotacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((v: unknown) => CriarAnotacaoInput.parse(v))
  .handler(async ({ data, context }) => {
    await validarAcessoProjeto(context.supabase, context.userId, data.projetoId);

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const payload: Record<string, unknown> = {
      projeto_id: data.projetoId,
      titulo: data.titulo,
      nome: data.titulo,
      descricao: data.corpo.slice(0, 400),
      categoria: data.categoria,
      tipo: data.categoria,
      formato: "anotacao",
      origem: "manual",
      conteudo_texto: data.corpo,
      transcricao_status: "pendente",
      tags: data.tags ?? [],
      metadata: { autor: context.userId },
      created_by: context.userId,
      autor_id: context.userId,
      tamanho_bytes: new TextEncoder().encode(data.corpo).length,
      mime_type: "text/markdown",
    };

    // Descoberta de colunas: tolera schemas sem uma ou outra coluna (padrão do projeto).
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

    if (!inserted) throw new Error(`Falha ao criar anotação: ${lastError ?? "erro desconhecido"}`);

    // Indexa síncrono (rápido — textos curtos). Erro não bloqueia a criação.
    try {
      await indexarDocumentoInterno(admin, inserted.id);
    } catch (e) {
      // status "erro" já foi gravado em indexarDocumentoInterno
    }
    return { ok: true, id: inserted.id };
  });

export const indexarDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((v: unknown) => IndexarInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: row } = await admin
      .from("documentos").select("projeto_id").eq("id", data.documentoId).maybeSingle();
    if (!row) throw new Error("Documento não encontrado.");
    await validarAcessoProjeto(context.supabase, context.userId, (row as { projeto_id: string }).projeto_id);
    return indexarDocumentoInterno(admin, data.documentoId);
  });

export const buscarConhecimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => BuscarInput.parse(v))
  .handler(async ({ data, context }) => {
    await validarAcessoProjeto(context.supabase, context.userId, data.projetoId);

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { embedTexto, vetorToLiteral } = await import("@/lib/base-conhecimento-embed.server");
    const vetor = await embedTexto(data.query);
    type Trecho = {
      chunk_id: string;
      documento_id: string;
      ordem: number;
      texto: string;
      similarity: number;
      titulo: string | null;
      categoria: string | null;
      formato: string | null;
      storage_path: string | null;
    };
    if (!vetor) return { trechos: [] as Trecho[] };

    const { data: rows, error } = await admin.rpc("match_documentos_chunks", {
      p_projeto_id: data.projetoId,
      p_query_embedding: vetorToLiteral(vetor),
      p_match_count: data.k ?? 8,
      p_categorias: data.categorias && data.categorias.length ? data.categorias : null,
    });
    if (error) throw new Error(`Busca falhou: ${error.message}`);

    return { trechos: (rows ?? []) as Trecho[] };
  });