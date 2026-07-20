import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { gerarCertificadoPDF, slugifyNome } from "@/lib/certificado-pdf";
import { BUCKET as DOCUMENTOS_BUCKET } from "@/lib/base-conhecimento-queries";
import { formatarDataBR } from "@/lib/date-utils";
import { compararTurmasPorCodigo } from "@/lib/turmas";
import { missingColumnFromError, operationalWriteError } from "@/lib/supabase-write-errors";

// Padrão: cada query retorna { rows, error? } com descoberta de colunas em runtime.
// Tabelas esperadas (todas com RLS por projeto): turmas, matriculas, cursistas,
// qualificados, entregas_beneficios, entregas_materiais.

export type Row = Record<string, unknown> & { id: string };

// ---------- Turmas do projeto (para seletor) ----------

export function turmasDoProjetoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["administrativo", "turmas", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      const { data, error } = await supabase
        .from("turmas")
        .select("id, codigo, codigo_turma, nome_curso, curso, turno, municipio")
        .eq("projeto_id", projetoId);
      if (error) return { rows: [], error: error.message };
      const rows = ((data ?? []) as Row[]).slice().sort(compararTurmasPorCodigo);
      return { rows };
    },
  });
}

// ---------- Cursistas por turma + status de qualificação ----------

export type CursistaLinha = {
  matriculaId: string;
  cursistaId: string | null;
  nome: string;
  email: string | null;
  cpf: string | null;
  status: string;
  qualificado: {
    id: string;
    data_qualificacao: string | null;
    certificado_url: string | null;
  } | null;
};

export function cursistasComStatusOptions(turmaId: string | null) {
  return queryOptions({
    queryKey: ["administrativo", "cursistas-status", turmaId],
    enabled: !!turmaId,
    queryFn: async (): Promise<{ rows: CursistaLinha[]; error?: string }> => {
      if (!turmaId) return { rows: [] };
      let matRes = await supabase
        .from("matriculas")
        .select("*, cursistas(*)")
        .eq("turma_id", turmaId);
      if (matRes.error) {
        matRes = await supabase.from("matriculas").select("*").eq("turma_id", turmaId);
      }
      if (matRes.error) return { rows: [], error: matRes.error.message };
      const matriculas = (matRes.data ?? []) as Row[];
      const matriculaIds = matriculas.map((m) => m.id);
      const cursistaIds = matriculas
        .map((m) => m.cursista_id as string | undefined)
        .filter(Boolean) as string[];

      // Busca qualificados por matricula_id ou cursista_id (o que existir).
      let qualRows: Row[] = [];
      if (matriculaIds.length) {
        const q1 = await supabase.from("qualificados").select("*").in("matricula_id", matriculaIds);
        if (!q1.error) qualRows = (q1.data ?? []) as Row[];
        else if (cursistaIds.length) {
          const q2 = await supabase.from("qualificados").select("*").in("cursista_id", cursistaIds);
          if (!q2.error) qualRows = (q2.data ?? []) as Row[];
        }
      }
      const qualPorMatricula = new Map<string, Row>();
      const qualPorCursista = new Map<string, Row>();
      for (const q of qualRows) {
        const mid = q.matricula_id as string | undefined;
        const cid = q.cursista_id as string | undefined;
        if (mid) qualPorMatricula.set(mid, q);
        if (cid) qualPorCursista.set(cid, q);
      }

      const rows: CursistaLinha[] = matriculas.map((m) => {
        const cursista = (m.cursistas as Row | null | undefined) ?? null;
        const cursistaId = (m.cursista_id as string | undefined) ?? cursista?.id ?? null;
        const q =
          qualPorMatricula.get(m.id) ??
          (cursistaId ? qualPorCursista.get(cursistaId) : undefined) ??
          null;
        return {
          matriculaId: m.id,
          cursistaId,
          nome:
            (cursista?.nome as string) ??
            (cursista?.nome_completo as string) ??
            (m.nome as string) ??
            "—",
          email: (cursista?.email as string) ?? (m.email as string) ?? null,
          cpf: (cursista?.cpf as string) ?? (m.cpf as string) ?? null,
          status: (m.status as string) ?? (m.situacao as string) ?? "ativa",
          qualificado: q
            ? {
                id: q.id as string,
                data_qualificacao: (q.data_qualificacao as string) ?? (q.data as string) ?? null,
                certificado_url: (q.certificado_url as string) ?? null,
              }
            : null,
        };
      });

      rows.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      return { rows };
    },
  });
}

export async function emitirCertificado(input: {
  matriculaId: string;
  cursistaId: string | null;
  turmaId: string;
  projetoId: string | null;
  observacoes?: string | null;
  nome: string;
  cpf?: string | null;
  turmaNome: string;
  projetoNome?: string | null;
}): Promise<{ storagePath: string }> {
  // 1) Gera PDF
  const dataConclusao = new Date();
  const blob = gerarCertificadoPDF({
    nome: input.nome,
    cpf: input.cpf,
    turma: input.turmaNome,
    projeto: input.projetoNome,
    dataConclusao,
    observacoes: input.observacoes,
  });
  const arrayBuf = await blob.arrayBuffer();

  // 2) Upload no bucket `documentos`
  const uid = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  const slug = slugifyNome(input.nome) || "cursista";
  const projetoSeg = input.projetoId ?? "sem-projeto";
  const path = `${projetoSeg}/certificados/${uid}-${slug}.pdf`;
  const up = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, arrayBuf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (up.error) throw new Error(`Falha ao enviar certificado: ${up.error.message}`);

  // 3) Registra em `documentos` (best-effort: se a tabela/coluna faltar, seguimos)
  try {
    const docPayload: Record<string, unknown> = {
      titulo: `Certificado — ${input.nome}`,
      categoria: "outros",
      storage_path: path,
      nome_arquivo: `${slug}.pdf`,
      mime_type: "application/pdf",
      tamanho_bytes: arrayBuf.byteLength,
      descricao: `Certificado de qualificação da turma "${input.turmaNome}".`,
    };
    if (input.projetoId) docPayload.projeto_id = input.projetoId;
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) docPayload.created_by = userData.user.id;
    let docRes = await supabase.from("documentos").insert(docPayload);
    if (docRes.error && /column .* does not exist/i.test(docRes.error.message)) {
      for (const k of ["descricao", "created_by", "mime_type", "tamanho_bytes", "nome_arquivo"]) {
        if (k in docPayload) delete docPayload[k];
      }
      docRes = await supabase.from("documentos").insert(docPayload);
    }
    if (docRes.error) {
      // Não bloqueia — apenas loga.

      console.warn(
        "[administrativo] Falha ao registrar certificado em documentos:",
        docRes.error.message,
      );
    }
  } catch (e) {
    console.warn("[administrativo] Registro em documentos ignorado:", e);
  }

  // 4) Insere em `qualificados`
  const payload: Record<string, unknown> = {
    matricula_id: input.matriculaId,
    turma_id: input.turmaId,
    data_qualificacao: dataConclusao.toISOString(),
    certificado_url: path,
  };
  if (input.cursistaId) payload.cursista_id = input.cursistaId;
  if (input.projetoId) payload.projeto_id = input.projetoId;
  if (input.observacoes) payload.observacoes = input.observacoes;
  let res = await supabase.from("qualificados").insert(payload);
  // Se colunas opcionais não existirem, remove e tenta novamente.
  if (res.error && /column .* does not exist/i.test(res.error.message)) {
    for (const k of ["projeto_id", "certificado_url", "observacoes", "cursista_id"]) {
      if (k in payload) delete payload[k];
    }
    res = await supabase.from("qualificados").insert(payload);
  }
  if (res.error) {
    // rollback do arquivo se o insert falhar
    await supabase.storage.from(DOCUMENTOS_BUCKET).remove([path]);
    throw new Error(res.error.message);
  }
  return { storagePath: path };
}

export async function revogarCertificado(qualificadoId: string) {
  // busca certificado_url para remover arquivo
  const { data: row } = await supabase
    .from("qualificados")
    .select("id, certificado_url")
    .eq("id", qualificadoId)
    .maybeSingle();
  const { error } = await supabase.from("qualificados").delete().eq("id", qualificadoId);
  if (error) throw new Error(error.message);
  const path = (row as { certificado_url?: string | null } | null)?.certificado_url;
  const warnings: string[] = [];
  if (path && !/^https?:/i.test(path)) {
    const rm = await supabase.storage.from(DOCUMENTOS_BUCKET).remove([path]);
    if (rm.error) warnings.push(`arquivo do certificado (${rm.error.message})`);
    const del = await supabase.from("documentos").delete().eq("storage_path", path);
    if (del.error) warnings.push(`registro em documentos (${del.error.message})`);
  }
  return { warnings };
}

export async function baixarCertificado(certificadoUrl: string): Promise<string> {
  // Se já é URL http(s), retorna direto; caso contrário, gera signed url.
  if (/^https?:/i.test(certificadoUrl)) return certificadoUrl;
  const { data, error } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .createSignedUrl(certificadoUrl, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------- Entregas ----------

export type EntregaTabela = "entregas_beneficios" | "entregas_materiais";

export function entregasListOptions(tabela: EntregaTabela, projetoId: string | null) {
  return queryOptions({
    queryKey: ["administrativo", tabela, projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      // tenta filtrar por projeto_id; se não existir, retorna tudo (RLS filtra).
      let res = await supabase
        .from(tabela)
        .select("*, cursistas(*), turmas(*), beneficiarias(*)")
        .eq("projeto_id", projetoId)
        .order("data_entrega", { ascending: false });
      if (res.error && /column .* does not exist/i.test(res.error.message)) {
        res = await supabase.from(tabela).select("*, cursistas(*), turmas(*), beneficiarias(*)");
      }
      if (res.error) {
        // fallback sem beneficiarias (pode faltar FK no schema)
        res = await supabase.from(tabela).select("*, cursistas(*), turmas(*)");
      }
      if (res.error) {
        // fallback sem embed
        res = await supabase.from(tabela).select("*");
      }
      if (res.error) return { rows: [], error: res.error.message };
      return { rows: (res.data ?? []) as Row[] };
    },
  });
}

export type EntregaInput = {
  id?: string;
  projetoId: string | null;
  turmaId: string | null;
  cursistaId: string | null;
  matriculaId: string | null;
  descricao: string;
  quantidade?: number | null;
  valor?: number | null;
  dataEntrega: string;
  status: string;
  observacoes?: string | null;
};

export async function upsertEntrega(tabela: EntregaTabela, input: EntregaInput) {
  const payload: Record<string, unknown> = {
    descricao: input.descricao,
    data_entrega: input.dataEntrega,
    status: input.status,
  };
  if (input.projetoId) payload.projeto_id = input.projetoId;
  if (input.turmaId) payload.turma_id = input.turmaId;
  if (input.cursistaId) payload.cursista_id = input.cursistaId;
  if (input.matriculaId) payload.matricula_id = input.matriculaId;
  if (input.quantidade != null) payload.quantidade = input.quantidade;
  if (input.valor != null) payload.valor = input.valor;
  if (input.observacoes) payload.observacoes = input.observacoes;

  const optionalLegacyColumns = new Set([
    "turma_id",
    "cursista_id",
    "matricula_id",
    "quantidade",
    "valor",
    "observacoes",
  ]);
  const id = input.id;

  for (let attempt = 0; attempt < optionalLegacyColumns.size + 1; attempt += 1) {
    const res = id
      ? await supabase.from(tabela).update(payload).eq("id", id)
      : await supabase.from(tabela).insert(payload);
    if (!res.error) return;

    const missingColumn = missingColumnFromError(res.error);
    if (missingColumn && optionalLegacyColumns.has(missingColumn) && missingColumn in payload) {
      delete payload[missingColumn];
      continue;
    }
    throw operationalWriteError(
      res.error,
      tabela === "entregas_materiais" ? "materiais" : "benefícios",
    );
  }

  throw new Error("Não foi possível adaptar a gravação ao banco de dados atual.");
}

export async function deleteEntrega(tabela: EntregaTabela, id: string) {
  const { error } = await supabase.from(tabela).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Helpers ----------

export function pickFirst(row: Row | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Delegado para @/lib/date-utils (fonte única, tz-safe).
  const br = formatarDataBR(iso);
  return br || String(iso);
}

export function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
