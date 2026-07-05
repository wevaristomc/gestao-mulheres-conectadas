import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Mesmo padrão de pedagogico-queries / financeiro-queries: descoberta em
// runtime, retorna { rows, error? } para a UI degradar graciosamente.

export type Row = Record<string, unknown> & { id: string };

export const ETAPAS = [
  { key: "identificado", label: "Identificado" },
  { key: "em_analise", label: "Em análise" },
  { key: "em_elaboracao", label: "Em elaboração" },
  { key: "submetido", label: "Submetido" },
  { key: "aprovado", label: "Aprovado" },
  { key: "rejeitado", label: "Rejeitado" },
] as const;

export type EtapaKey = (typeof ETAPAS)[number]["key"];

export function etapaLabel(k: string | null | undefined): string {
  return ETAPAS.find((e) => e.key === k)?.label ?? String(k ?? "—");
}

// ---------- Editais ----------

export function editaisListOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["captacao", "editais", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      let res = await supabase
        .from("editais")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("created_at", { ascending: false });
      if (res.error && /column .*created_at.* does not exist/i.test(res.error.message)) {
        res = await supabase.from("editais").select("*").eq("projeto_id", projetoId);
      }
      if (res.error) return { rows: [], error: res.error.message };
      return { rows: (res.data ?? []) as Row[] };
    },
  });
}

export function editalByIdOptions(id: string | null) {
  return queryOptions({
    queryKey: ["captacao", "edital", id],
    enabled: !!id,
    queryFn: async (): Promise<{ row: Row | null; error?: string }> => {
      if (!id) return { row: null };
      const { data, error } = await supabase.from("editais").select("*").eq("id", id).maybeSingle();
      if (error) return { row: null, error: error.message };
      return { row: (data as Row) ?? null };
    },
  });
}

export async function upsertEdital(input: {
  id?: string;
  projeto_id: string;
  titulo: string;
  orgao?: string | null;
  valor_previsto?: number | null;
  prazo?: string | null;
  etapa: EtapaKey;
  responsavel?: string | null;
  link?: string | null;
  observacoes?: string | null;
}) {
  const payload: Record<string, unknown> = {
    projeto_id: input.projeto_id,
    titulo: input.titulo,
    etapa: input.etapa,
  };
  if (input.orgao !== undefined) payload.orgao = input.orgao;
  if (input.valor_previsto !== undefined) payload.valor_previsto = input.valor_previsto;
  if (input.prazo !== undefined) payload.prazo = input.prazo;
  if (input.responsavel !== undefined) payload.responsavel = input.responsavel;
  if (input.link !== undefined) payload.link = input.link;
  if (input.observacoes !== undefined) payload.observacoes = input.observacoes;

  if (input.id) {
    const { error } = await supabase.from("editais").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
    return input.id;
  }
  const { data, error } = await supabase.from("editais").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteEdital(id: string) {
  const { error } = await supabase.from("editais").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moverEtapa(edital: Row, novaEtapa: EtapaKey) {
  const anterior = String(edital.etapa ?? "");
  if (anterior === novaEtapa) return;
  const { error } = await supabase.from("editais").update({ etapa: novaEtapa }).eq("id", edital.id);
  if (error) throw new Error(error.message);
  // Registra histórico — se a tabela não existir, ignora silenciosamente.
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("editais_historico").insert({
    edital_id: edital.id,
    autor_id: userData.user?.id ?? null,
    evento: "mudanca_etapa",
    descricao: `${etapaLabel(anterior)} → ${etapaLabel(novaEtapa)}`,
  });
}

// ---------- Histórico ----------

export function historicoEditalOptions(editalId: string | null) {
  return queryOptions({
    queryKey: ["captacao", "historico", editalId],
    enabled: !!editalId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!editalId) return { rows: [] };
      const { data, error } = await supabase
        .from("editais_historico")
        .select("*")
        .eq("edital_id", editalId)
        .order("created_at", { ascending: false });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Row[] };
    },
  });
}

export async function registrarHistorico(input: {
  edital_id: string;
  descricao: string;
  evento?: string;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("editais_historico").insert({
    edital_id: input.edital_id,
    autor_id: userData.user?.id ?? null,
    evento: input.evento ?? "nota",
    descricao: input.descricao,
  });
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
  const n = Number(String(v).replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  } catch {
    return String(iso);
  }
}

export function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86_400_000);
}