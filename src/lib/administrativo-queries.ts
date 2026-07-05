import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
        .select("id, nome, titulo")
        .eq("projeto_id", projetoId)
        .order("nome", { ascending: true });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Row[] };
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
        const q1 = await supabase
          .from("qualificados")
          .select("*")
          .in("matricula_id", matriculaIds);
        if (!q1.error) qualRows = (q1.data ?? []) as Row[];
        else if (cursistaIds.length) {
          const q2 = await supabase
            .from("qualificados")
            .select("*")
            .in("cursista_id", cursistaIds);
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
                data_qualificacao:
                  (q.data_qualificacao as string) ?? (q.data as string) ?? null,
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
  certificadoUrl?: string | null;
  observacoes?: string | null;
}) {
  const payload: Record<string, unknown> = {
    matricula_id: input.matriculaId,
    turma_id: input.turmaId,
    data_qualificacao: new Date().toISOString(),
  };
  if (input.cursistaId) payload.cursista_id = input.cursistaId;
  if (input.projetoId) payload.projeto_id = input.projetoId;
  if (input.certificadoUrl) payload.certificado_url = input.certificadoUrl;
  if (input.observacoes) payload.observacoes = input.observacoes;
  let res = await supabase.from("qualificados").insert(payload);
  // Se colunas opcionais não existirem, remove e tenta novamente.
  if (res.error && /column .* does not exist/i.test(res.error.message)) {
    for (const k of ["projeto_id", "certificado_url", "observacoes", "cursista_id"]) {
      if (k in payload) delete payload[k];
    }
    res = await supabase.from("qualificados").insert(payload);
  }
  if (res.error) throw new Error(res.error.message);
}

export async function revogarCertificado(qualificadoId: string) {
  const { error } = await supabase.from("qualificados").delete().eq("id", qualificadoId);
  if (error) throw new Error(error.message);
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
        .select("*, cursistas(*), turmas(*)")
        .eq("projeto_id", projetoId)
        .order("data_entrega", { ascending: false });
      if (res.error && /column .* does not exist/i.test(res.error.message)) {
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

  const stripOptional = (p: Record<string, unknown>) => {
    for (const k of [
      "projeto_id",
      "matricula_id",
      "quantidade",
      "valor",
      "observacoes",
    ]) {
      if (k in p) delete p[k];
    }
  };

  if (input.id) {
    let res = await supabase.from(tabela).update(payload).eq("id", input.id);
    if (res.error && /column .* does not exist/i.test(res.error.message)) {
      stripOptional(payload);
      res = await supabase.from(tabela).update(payload).eq("id", input.id);
    }
    if (res.error) throw new Error(res.error.message);
  } else {
    let res = await supabase.from(tabela).insert(payload);
    if (res.error && /column .* does not exist/i.test(res.error.message)) {
      stripOptional(payload);
      res = await supabase.from(tabela).insert(payload);
    }
    if (res.error) throw new Error(res.error.message);
  }
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
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return String(iso);
  }
}

export function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}