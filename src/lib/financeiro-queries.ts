import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Segue o mesmo padrão de pedagogico-queries: cada query retorna
// { rows, error? } e as colunas são descobertas em runtime (pickFirst),
// permitindo que o schema evolua sem quebrar a UI.

export type Row = Record<string, unknown> & { id: string };

// ---------- Orçamento ----------

export function orcamentoItensOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["financeiro", "orcamento", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      const { data, error } = await supabase
        .from("orcamento_itens")
        .select("*")
        .eq("projeto_id", projetoId);
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Row[] };
    },
  });
}

export async function upsertOrcamentoItem(input: {
  id?: string;
  projeto_id: string;
  descricao: string | null;
  categoria?: string | null;
  valor_previsto: number;
  valor_executado?: number;
}) {
  const payload: Record<string, unknown> = {
    projeto_id: input.projeto_id,
    valor_previsto: input.valor_previsto,
  };
  if (input.descricao !== undefined) payload.descricao = input.descricao;
  if (input.categoria !== undefined) payload.categoria = input.categoria;
  if (input.valor_executado !== undefined) payload.valor_executado = input.valor_executado;
  if (input.id) {
    const { error } = await supabase.from("orcamento_itens").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("orcamento_itens").insert(payload);
    if (error) throw new Error(error.message);
  }
}

export async function deleteOrcamentoItem(id: string) {
  const { error } = await supabase.from("orcamento_itens").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Fornecedores ----------

export function fornecedoresListOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["financeiro", "fornecedores", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      // Tenta filtrar por projeto; cai para lista global se a coluna não existir.
      let res = await supabase.from("fornecedores").select("*").eq("projeto_id", projetoId);
      if (res.error && /projeto_id/i.test(res.error.message)) {
        res = await supabase.from("fornecedores").select("*");
      }
      if (res.error) return { rows: [], error: res.error.message };
      return { rows: (res.data ?? []) as Row[] };
    },
  });
}

export async function upsertFornecedor(input: {
  id?: string;
  projeto_id: string;
  nome: string;
  cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
}) {
  const base: Record<string, unknown> = { nome: input.nome };
  if (input.cnpj !== undefined) base.cnpj = input.cnpj;
  if (input.email !== undefined) base.email = input.email;
  if (input.telefone !== undefined) base.telefone = input.telefone;
  const payloadComProj = input.id ? base : { ...base, projeto_id: input.projeto_id };
  const run = (p: Record<string, unknown>) =>
    input.id
      ? supabase.from("fornecedores").update(p).eq("id", input.id)
      : supabase.from("fornecedores").insert(p);
  let res = await run(payloadComProj);
  if (res.error && /projeto_id/i.test(res.error.message)) {
    res = await run(base);
  }
  if (res.error) throw new Error(res.error.message);
}

export async function deleteFornecedor(id: string) {
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Despesas ----------

export function despesasListOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["financeiro", "despesas", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      const { data, error } = await supabase
        .from("despesas")
        .select("*")
        .eq("projeto_id", projetoId);
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Row[] };
    },
  });
}

export async function upsertDespesa(input: {
  id?: string;
  projeto_id: string;
  descricao: string | null;
  valor: number;
  data: string | null;
  fornecedor_id?: string | null;
  orcamento_item_id?: string | null;
  status?: string | null;
}) {
  const payload: Record<string, unknown> = {
    projeto_id: input.projeto_id,
    valor: input.valor,
  };
  if (input.descricao !== undefined) payload.descricao = input.descricao;
  if (input.data !== undefined) payload.data = input.data;
  if (input.fornecedor_id !== undefined) payload.fornecedor_id = input.fornecedor_id;
  if (input.orcamento_item_id !== undefined) payload.orcamento_item_id = input.orcamento_item_id;
  if (input.status !== undefined) payload.status = input.status;
  if (input.id) {
    const { error } = await supabase.from("despesas").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("despesas").insert(payload);
    if (error) throw new Error(error.message);
  }
}

export async function deleteDespesa(id: string) {
  const { error } = await supabase.from("despesas").delete().eq("id", id);
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

export function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
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