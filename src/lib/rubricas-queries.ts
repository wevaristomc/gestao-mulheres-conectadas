import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Rubrica = Record<string, unknown> & {
  id: string;
  codigo?: string | null;
  descricao?: string | null;
  valor_previsto?: number | null;
};

export function rubricasListOptions() {
  return queryOptions({
    queryKey: ["financeiro", "rubricas"],
    queryFn: async (): Promise<{ rows: Rubrica[]; error?: string }> => {
      const { data, error } = await supabase.from("rubricas").select("*");
      if (error) return { rows: [], error: error.message };
      const rows = ((data ?? []) as Rubrica[]).slice().sort((a, b) =>
        String(a.codigo ?? "").localeCompare(String(b.codigo ?? ""), "pt-BR"),
      );
      return { rows };
    },
  });
}

export async function atualizarRubricaPrevisto(id: string, valor_previsto: number) {
  const { error } = await supabase.from("rubricas").update({ valor_previsto }).eq("id", id);
  if (error) throw new Error(error.message);
}

export function despesasPorRubricaOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["financeiro", "despesas-rubrica", projetoId],
    enabled: !!projetoId,
    queryFn: async () => {
      if (!projetoId) return { rows: [] as Array<{ rubrica_id: string; total: number }> };
      const { data, error } = await supabase
        .from("despesas")
        .select("rubrica_id, valor")
        .eq("projeto_id", projetoId);
      if (error) return { rows: [], error: error.message };
      const map = new Map<string, number>();
      for (const d of data ?? []) {
        const rid = String((d as Record<string, unknown>).rubrica_id ?? "");
        if (!rid) continue;
        map.set(rid, (map.get(rid) ?? 0) + Number((d as Record<string, unknown>).valor ?? 0));
      }
      return { rows: Array.from(map, ([rubrica_id, total]) => ({ rubrica_id, total })) };
    },
  });
}