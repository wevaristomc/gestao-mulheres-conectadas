import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EtapaStatus = "planejada" | "em_andamento" | "concluida" | "prestacao_contas";
export type AtividadeStatus = "pendente" | "em_andamento" | "concluida" | "bloqueada";
export type Prioridade = "baixa" | "media" | "alta" | "critica";

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
  responsavel_id: string | null;
  colaboradores: string[];
  prioridade: Prioridade;
  ordem_kanban: number;
  descricao_detalhada: string | null;
  comentarios_count?: number;
};

export type Comentario = {
  id: string;
  atividade_id: string;
  user_id: string;
  texto: string;
  criado_em: string;
};

const ETAPAS_TABLE = "etapas" as unknown as never;
const ATIV_TABLE = "etapa_atividades" as unknown as never;
const COMMENT_TABLE = "atividade_comentarios" as unknown as never;

function normalizeAtividade(row: any): Atividade {
  return {
    id: row.id,
    etapa_id: row.etapa_id,
    grupo: row.grupo,
    titulo: row.titulo,
    descricao: row.descricao ?? null,
    responsavel: row.responsavel ?? null,
    prazo: row.prazo ?? null,
    status: row.status,
    ordem: Number(row.ordem ?? 0),
    vinculo_modulo: row.vinculo_modulo ?? null,
    concluida_em: row.concluida_em ?? null,
    concluida_por: row.concluida_por ?? null,
    responsavel_id: row.responsavel_id ?? null,
    colaboradores: Array.isArray(row.colaboradores) ? row.colaboradores : [],
    prioridade: (row.prioridade as Prioridade) ?? "media",
    ordem_kanban: Number(row.ordem_kanban ?? 0),
    descricao_detalhada: row.descricao_detalhada ?? null,
  };
}

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
      return { rows: ((data ?? []) as any[]).map(normalizeAtividade) };
    },
  });
}

export function atividadesAllOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["etapas", "atividades-all", projetoId],
    queryFn: async (): Promise<{ rows: Atividade[]; error?: string }> => {
      // 1. IDs das etapas do projeto ativo
      let etapasQ = supabase.from(ETAPAS_TABLE).select("id");
      if (projetoId) etapasQ = (etapasQ as any).eq("projeto_id", projetoId);
      const { data: etapas, error: e1 } = await (etapasQ as any);
      if (e1) return { rows: [], error: e1.message };
      const ids = ((etapas ?? []) as { id: string }[]).map((r) => r.id);
      if (ids.length === 0) return { rows: [] };
      const { data, error } = await (supabase.from(ATIV_TABLE) as any)
        .select("*")
        .in("etapa_id", ids)
        .order("ordem_kanban", { ascending: true });
      if (error) return { rows: [], error: error.message };
      return { rows: ((data ?? []) as any[]).map(normalizeAtividade) };
    },
  });
}

export function minhasDemandasOptions(userId: string | null, projetoId: string | null) {
  return queryOptions({
    queryKey: ["minhas-demandas", userId, projetoId],
    enabled: !!userId,
    queryFn: async (): Promise<{ rows: Atividade[]; error?: string }> => {
      if (!userId) return { rows: [] };
      let etapasQ = supabase.from(ETAPAS_TABLE).select("id");
      if (projetoId) etapasQ = (etapasQ as any).eq("projeto_id", projetoId);
      const { data: etapas } = await (etapasQ as any);
      const etapaIds = ((etapas ?? []) as { id: string }[]).map((r) => r.id);
      if (etapaIds.length === 0) return { rows: [] };
      const { data, error } = await (supabase.from(ATIV_TABLE) as any)
        .select("*")
        .in("etapa_id", etapaIds)
        .or(`responsavel_id.eq.${userId},colaboradores.cs.{${userId}}`)
        .order("prazo", { ascending: true, nullsFirst: false });
      if (error) return { rows: [], error: error.message };
      return { rows: ((data ?? []) as any[]).map(normalizeAtividade) };
    },
  });
}

export function comentariosOptions(atividadeId: string | null) {
  return queryOptions({
    queryKey: ["atividade-comentarios", atividadeId],
    enabled: !!atividadeId,
    queryFn: async (): Promise<Comentario[]> => {
      if (!atividadeId) return [];
      const { data, error } = await (supabase.from(COMMENT_TABLE) as any)
        .select("*")
        .eq("atividade_id", atividadeId)
        .order("criado_em", { ascending: true });
      if (error) return [];
      return (data ?? []) as Comentario[];
    },
  });
}

export async function adicionarComentario(atividadeId: string, userId: string, texto: string) {
  const t = texto.trim();
  if (!t) throw new Error("Comentário vazio");
  const { error } = await (supabase.from(COMMENT_TABLE) as any).insert({
    atividade_id: atividadeId,
    user_id: userId,
    texto: t,
  });
  if (error) throw new Error(error.message);
}

export async function atualizarKanban(
  id: string,
  patch: { status?: AtividadeStatus; ordem_kanban?: number },
  userId: string | null,
) {
  const payload: Record<string, unknown> = { ...patch };
  if (patch.status === "concluida") {
    payload.concluida_em = new Date().toISOString();
    payload.concluida_por = userId;
  } else if (patch.status && patch.status !== "concluida") {
    payload.concluida_em = null;
    payload.concluida_por = null;
  }
  const { error } = await (supabase.from(ATIV_TABLE) as any).update(payload).eq("id", id);
  if (error) throw new Error(error.message);
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
  responsavel_id?: string | null;
  colaboradores?: string[];
  prioridade?: Prioridade;
  descricao_detalhada?: string | null;
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
    responsavel_id: input.responsavel_id ?? null,
    colaboradores: input.colaboradores ?? [],
    prioridade: input.prioridade ?? "media",
    descricao_detalhada: input.descricao_detalhada ?? null,
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