import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EtapaStatus = "planejada" | "em_andamento" | "concluida" | "prestacao_contas";
export type AtividadeStatus = "pendente" | "em_andamento" | "concluida" | "bloqueada";

export type Etapa = {
  id: string;
  projeto_id: string | null;
  numero: number;
  titulo: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: EtapaStatus;
};

export type Atividade = {
  id: string;
  etapa_id: string;
  grupo: string;
  titulo: string;
  descricao: string | null;
  responsavel: string | null;
  prazo: string | null;
  status: AtividadeStatus;
  ordem: number;
  vinculo_modulo: string | null;
  concluida_em: string | null;
  concluida_por: string | null;
};

const ETAPAS_TABLE = "etapas" as unknown as never;
const ATIV_TABLE = "etapa_atividades" as unknown as never;

export function etapasListOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["etapas", "list", projetoId],
    queryFn: async (): Promise<{ rows: Etapa[]; error?: string }> => {
      let q = supabase.from(ETAPAS_TABLE).select("*");
      if (projetoId) q = (q as any).eq("projeto_id", projetoId);
      const { data, error } = await (q as any).order("numero", { ascending: true });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Etapa[] };
    },
  });
}

export function atividadesByEtapaOptions(etapaId: string | null) {
  return queryOptions({
    queryKey: ["etapas", "atividades", etapaId],
    enabled: !!etapaId,
    queryFn: async (): Promise<{ rows: Atividade[]; error?: string }> => {
      if (!etapaId) return { rows: [] };
      const { data, error } = await (supabase.from(ATIV_TABLE) as any)
        .select("*")
        .eq("etapa_id", etapaId)
        .order("ordem", { ascending: true });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Atividade[] };
    },
  });
}

export async function toggleAtividade(
  id: string,
  status: AtividadeStatus,
  userId: string | null,
) {
  const payload: Record<string, unknown> = { status };
  if (status === "concluida") {
    payload.concluida_em = new Date().toISOString();
    payload.concluida_por = userId;
  } else {
    payload.concluida_em = null;
    payload.concluida_por = null;
  }
  const { error } = await (supabase.from(ATIV_TABLE) as any).update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export type UpsertAtividadeInput = {
  id?: string;
  etapa_id: string;
  grupo: string;
  titulo: string;
  descricao?: string | null;
  responsavel?: string | null;
  prazo?: string | null;
  vinculo_modulo?: string | null;
  ordem?: number;
};

export async function upsertAtividade(input: UpsertAtividadeInput) {
  const payload: Record<string, unknown> = {
    etapa_id: input.etapa_id,
    grupo: input.grupo,
    titulo: input.titulo,
    descricao: input.descricao ?? null,
    responsavel: input.responsavel ?? null,
    prazo: input.prazo || null,
    vinculo_modulo: input.vinculo_modulo ?? null,
  };
  if (input.ordem !== undefined) payload.ordem = input.ordem;
  const q = input.id
    ? (supabase.from(ATIV_TABLE) as any).update(payload).eq("id", input.id)
    : (supabase.from(ATIV_TABLE) as any).insert(payload);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function deleteAtividade(id: string) {
  const { error } = await (supabase.from(ATIV_TABLE) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function progresso(atividades: Atividade[]) {
  const total = atividades.length;
  const concluidas = atividades.filter((a) => a.status === "concluida").length;
  const pct = total === 0 ? 0 : Math.round((concluidas / total) * 100);
  return { total, concluidas, pct };
}

export function isAtrasada(a: Atividade): boolean {
  if (a.status === "concluida") return false;
  if (!a.prazo) return false;
  const p = new Date(a.prazo + "T23:59:59");
  return p.getTime() < Date.now();
}

export function etapaAtual(etapas: Etapa[]): Etapa | null {
  return (
    etapas.find((e) => e.status === "em_andamento") ??
    etapas.find((e) => e.status === "prestacao_contas") ??
    etapas[0] ??
    null
  );
}

export const ETAPA_STATUS_LABEL: Record<EtapaStatus, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  prestacao_contas: "Prestação de contas",
};

export const ATIV_STATUS_LABEL: Record<AtividadeStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  bloqueada: "Bloqueada",
};

export function moduleLink(mod: string | null): { label: string; to: string } | null {
  if (!mod) return null;
  switch (mod) {
    case "cotacoes":
      return { label: "Abrir Cotações", to: "/financeiro" };
    case "ava":
      return { label: "Abrir AVA", to: "/mte/ava" };
    case "pendencias":
      return { label: "Abrir Pendências", to: "/pendencias" };
    case "locais":
      return { label: "Abrir Locais", to: "/configuracoes/locais" };
    default:
      return null;
  }
}