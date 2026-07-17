import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { lerValorMonetario } from "@/lib/rubricas-import";
import { missingColumnFromError, operationalWriteError } from "@/lib/supabase-write-errors";

export type Row = Record<string, unknown> & { id: string };

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
  const run = (value: Record<string, unknown>) =>
    input.id
      ? supabase.from("orcamento_itens").update(value).eq("id", input.id)
      : supabase.from("orcamento_itens").insert(value);
  let result = await run(payload);
  if (result.error && missingColumnFromError(result.error)) {
    const legado: Record<string, unknown> = {
      projeto_id: input.projeto_id,
      rubrica: input.categoria?.trim() || input.descricao?.trim() || "Item orçamentário",
      valor_previsto: input.valor_previsto,
    };
    if (input.valor_executado !== undefined) legado.valor_executado = input.valor_executado;
    result = await run(legado);
  }
  if (result.error) throw operationalWriteError(result.error, "o item orçamentário");
}

export async function deleteOrcamentoItem(id: string) {
  const { error } = await supabase.from("orcamento_itens").delete().eq("id", id);
  if (error) throw operationalWriteError(error, "o item orçamentário");
}

export function fornecedoresListOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["financeiro", "fornecedores", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      let res = await supabase.from("fornecedores").select("*").eq("projeto_id", projetoId);
      if (res.error && missingColumnFromError(res.error)) {
        res = await supabase.from("fornecedores").select("*");
      }
      if (res.error) return { rows: [], error: res.error.message };
      const rows = ((res.data ?? []) as Row[]).map((row) => ({
        ...row,
        cnpj: row.cnpj ?? row.cnpj_cpf ?? null,
      }));
      return { rows };
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
  const payload = input.id ? base : { ...base, projeto_id: input.projeto_id };
  const run = (value: Record<string, unknown>) =>
    input.id
      ? supabase.from("fornecedores").update(value).eq("id", input.id)
      : supabase.from("fornecedores").insert(value);
  let result = await run(payload);
  if (result.error && missingColumnFromError(result.error)) {
    const legado: Record<string, unknown> = { nome: input.nome };
    if (input.cnpj !== undefined) legado.cnpj_cpf = input.cnpj;
    result = await run(legado);
  }
  if (result.error) throw operationalWriteError(result.error, "o fornecedor");
}

export async function deleteFornecedor(id: string) {
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) throw operationalWriteError(error, "o fornecedor");
}

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
  rubrica_id?: string | null;
  status?: string | null;
}) {
  const payload: Record<string, unknown> = {
    projeto_id: input.projeto_id,
    valor: input.valor,
  };
  if (input.descricao !== undefined) payload.descricao = input.descricao;
  if (input.data !== undefined) {
    payload.data = input.data;
    payload.data_despesa = input.data;
  }
  if (input.fornecedor_id !== undefined) payload.fornecedor_id = input.fornecedor_id;
  if (input.orcamento_item_id !== undefined) payload.orcamento_item_id = input.orcamento_item_id;
  if (input.rubrica_id !== undefined) payload.rubrica_id = input.rubrica_id;
  if (input.status !== undefined) payload.status = input.status;
  const run = (value: Record<string, unknown>) =>
    input.id
      ? supabase.from("despesas").update(value).eq("id", input.id)
      : supabase.from("despesas").insert(value);
  let result = await run(payload);
  if (result.error && missingColumnFromError(result.error)) {
    const compat = { ...payload };
    delete compat.data_despesa;
    delete compat.rubrica_id;
    result = await run(compat);
  }
  if (result.error) throw operationalWriteError(result.error, "a despesa");
}

export async function deleteDespesa(id: string) {
  const { error } = await supabase.from("despesas").delete().eq("id", id);
  if (error) throw operationalWriteError(error, "a despesa");
}

export function pickFirst(row: Row | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function toNumber(value: unknown): number {
  return lerValorMonetario(value) ?? 0;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = String(iso).slice(0, 10);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return String(iso);
  }
}
