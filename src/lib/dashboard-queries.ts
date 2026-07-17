import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FILTRO_STATUS_INATIVOS } from "@/lib/contagens";

// Todas as queries retornam { value: number | null, error?: string } para
// que os cards possam distinguir "carregando", "sem acesso" e "zero".
// O schema real é minimalista (descoberto em runtime) — se uma coluna
// esperada não existir, PostgREST devolve 42703 e o card cai para "—".

export type KpiResult = { value: number | null; error?: string };

export function kpiCursistasAtivasOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["kpi", "cursistas-ativas", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<KpiResult> => {
      if (!projetoId) return { value: null };
      // matrículas ativas (status NOT IN evadida/desistente) → turmas!inner(projeto_id = X)
      // Fonte única em @/lib/contagens — mantém dashboard/relatórios/orbe consistentes.
      const { count, error } = await supabase
        .from("matriculas")
        .select("id, turmas!inner(projeto_id)", { count: "exact", head: true })
        .eq("turmas.projeto_id", projetoId)
        .not("status", "in", FILTRO_STATUS_INATIVOS);
      if (error) return { value: null, error: error.message };
      return { value: count ?? 0 };
    },
  });
}

export function kpiTurmasOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["kpi", "turmas", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<KpiResult> => {
      if (!projetoId) return { value: null };
      const { count, error } = await supabase
        .from("turmas")
        .select("id", { count: "exact", head: true })
        .eq("projeto_id", projetoId);
      if (error) return { value: null, error: error.message };
      return { value: count ?? 0 };
    },
  });
}

export function kpiExecucaoOrcamentariaOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["kpi", "execucao-orcamentaria", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{
      value: number | null;
      error?: string;
      previsto?: number;
      executado?: number;
    }> => {
      if (!projetoId) return { value: null };
      const { data, error } = await supabase
        .from("orcamento_itens")
        .select("valor_previsto, valor_executado")
        .eq("projeto_id", projetoId);
      if (error) return { value: null, error: error.message };
      const rows = (data ?? []) as Array<{
        valor_previsto: number | null;
        valor_executado: number | null;
      }>;
      const previsto = rows.reduce((s, r) => s + Number(r.valor_previsto ?? 0), 0);
      const executado = rows.reduce((s, r) => s + Number(r.valor_executado ?? 0), 0);
      const pct = previsto > 0 ? (executado / previsto) * 100 : 0;
      return { value: pct, previsto, executado };
    },
  });
}

export function pendenciasAbertasCountOptions() {
  return queryOptions({
    queryKey: ["kpi", "pendencias-abertas"],
    queryFn: async (): Promise<KpiResult> => {
      const { count, error } = await supabase
        .from("pendencias")
        .select("id", { count: "exact", head: true })
        .eq("status", "aberta");
      if (error) return { value: null, error: error.message };
      return { value: count ?? 0 };
    },
    staleTime: 30_000,
  });
}

export type PendenciaRow = {
  id: string;
  status: string;
  criado_em: string | null;
  payload: Record<string, unknown> | null;
};

export function pendenciasListOptions(status: string | "todas") {
  return queryOptions({
    queryKey: ["pendencias", "list", status],
    queryFn: async (): Promise<{ rows: PendenciaRow[]; error?: string }> => {
      let q = supabase
        .from("pendencias")
        .select("id, status, criado_em, payload")
        .order("criado_em", { ascending: false })
        .limit(200);
      if (status !== "todas") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as PendenciaRow[] };
    },
  });
}
