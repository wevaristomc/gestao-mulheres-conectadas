import { queryOptions } from "@tanstack/react-query";
import { listarProvedores, listarPoliticas, listarConsumoIA } from "@/lib/ia.functions";
import { ultimaBusca } from "@/lib/editais-busca.functions";
import { supabase } from "@/integrations/supabase/client";

export function provedoresOptions() {
  return queryOptions({
    queryKey: ["ia", "provedores"],
    queryFn: async () => await listarProvedores({ data: {} as never }),
  });
}

export function politicasOptions() {
  return queryOptions({
    queryKey: ["ia", "politicas"],
    queryFn: async () => await listarPoliticas({ data: {} as never }),
  });
}

export function consumoOptions(dias: number = 14) {
  return queryOptions({
    queryKey: ["ia", "consumo", dias],
    queryFn: async () => await listarConsumoIA({ data: { dias } }),
  });
}

export function ultimaBuscaOptions() {
  return queryOptions({
    queryKey: ["editais", "ultima-busca"],
    refetchInterval: (q) => {
      const d = q.state.data as any;
      return d?.status === "executando" ? 2000 : false;
    },
    queryFn: async () => await ultimaBusca({ data: {} as never }),
  });
}

export type EditalRow = Record<string, unknown> & { id: string };

export function editaisBuscadosOptions(filtros: {
  projetoId: string | null;
  categoria?: string;
  esfera?: string;
  situacao?: string;
  q?: string;
}) {
  return queryOptions({
    queryKey: ["editais", "buscados", filtros],
    enabled: !!filtros.projetoId,
    queryFn: async (): Promise<{ rows: EditalRow[]; error?: string }> => {
      if (!filtros.projetoId) return { rows: [] };
      let q = supabase.from("editais").select("*").eq("projeto_id", filtros.projetoId);
      if (filtros.categoria) q = q.eq("categoria", filtros.categoria);
      if (filtros.esfera) q = q.eq("esfera", filtros.esfera);
      if (filtros.situacao) q = q.eq("situacao", filtros.situacao);
      if (filtros.q && filtros.q.trim()) q = q.ilike("titulo", `%${filtros.q.trim()}%`);
      const { data, error } = await q.order("aderencia_score", { ascending: false, nullsFirst: false }).limit(200);
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as EditalRow[] };
    },
  });
}

export const CATEGORIAS = [
  { key: "cultural", label: "Cultural", cor: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  { key: "tecnologico", label: "Tecnológico", cor: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { key: "educacional", label: "Educacional", cor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  { key: "reciclagem", label: "Reciclagem", cor: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30" },
  { key: "ambiental", label: "Ambiental", cor: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30" },
  { key: "social", label: "Social", cor: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  { key: "outro", label: "Outro", cor: "bg-muted text-muted-foreground border-border" },
] as const;

export const ESFERAS = [
  { key: "federal", label: "Federal" },
  { key: "estadual", label: "Estadual" },
  { key: "municipal", label: "Municipal" },
] as const;

export const SITUACOES = [
  { key: "novo", label: "Novo" },
  { key: "analisando", label: "Analisando" },
  { key: "aderente", label: "Aderente" },
  { key: "descartado", label: "Descartado" },
  { key: "inscrito", label: "Inscrito" },
] as const;

export function categoriaCor(k: string | null | undefined) {
  return CATEGORIAS.find((c) => c.key === k)?.cor ?? CATEGORIAS[6].cor;
}

export function categoriaLabel(k: string | null | undefined) {
  return CATEGORIAS.find((c) => c.key === k)?.label ?? "—";
}