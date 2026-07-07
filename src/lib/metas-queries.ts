import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type IndicadorCiclo = Record<string, unknown> & {
  ciclo?: number | null;
  municipio?: string | null;
  curso?: string | null;
  vagas_previstas?: number | null;
  matriculadas?: number | null;
  concluintes?: number | null;
  certificadas?: number | null;
  frequencia_media?: number | null;
  meta_conclusao_pct?: number | null;
  meta_frequencia_pct?: number | null;
};

export type Meta = Record<string, unknown> & {
  id: string;
  ciclo?: number | null;
  municipio?: string | null;
  curso?: string | null;
  vagas_previstas?: number | null;
  meta_conclusao_pct?: number | null;
  meta_frequencia_pct?: number | null;
};

export function indicadoresCicloOptions() {
  return queryOptions({
    queryKey: ["metas", "indicadores"],
    queryFn: async (): Promise<{ rows: IndicadorCiclo[]; error?: string }> => {
      const { data, error } = await supabase.from("vw_indicadores_ciclo").select("*");
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as IndicadorCiclo[] };
    },
  });
}

export function metasListOptions() {
  return queryOptions({
    queryKey: ["metas", "list"],
    queryFn: async (): Promise<{ rows: Meta[]; error?: string }> => {
      const { data, error } = await supabase.from("metas").select("*");
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Meta[] };
    },
  });
}

export async function atualizarMeta(input: {
  id: string;
  vagas_previstas?: number;
  meta_conclusao_pct?: number;
  meta_frequencia_pct?: number;
}) {
  const { id, ...rest } = input;
  const { error } = await supabase.from("metas").update(rest).eq("id", id);
  if (error) throw new Error(error.message);
}

export function semaforo(pct: number | null | undefined): "verde" | "amarelo" | "vermelho" {
  const v = Number(pct ?? 0);
  if (v >= 90) return "verde";
  if (v >= 60) return "amarelo";
  return "vermelho";
}

export function corSemaforo(s: ReturnType<typeof semaforo>): string {
  switch (s) {
    case "verde":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "amarelo":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default:
      return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
}