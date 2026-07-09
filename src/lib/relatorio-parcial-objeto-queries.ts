import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Estrutura das 8 seções do modelo oficial
// "2-MODELO_RELATORIO_DO_CUMPRIMENTO_DO_OBJETO" — DEQ_FISCAL Item I.
// Cada seção guarda `{ texto, contexto_ia?, atualizado_em? }` em jsonb.
export const SECOES_PARCIAL_OBJETO = [
  {
    key: "historico",
    label: "1. Histórico da execução",
    descricao:
      "Resumo do que foi executado no período (turmas, aulas, beneficiárias, marcos relevantes).",
  },
  {
    key: "divulgacao",
    label: "2. Divulgação e mobilização",
    descricao:
      "Ações de divulgação, canais utilizados, inscrições, seleção, comunicação com o público-alvo.",
  },
  {
    key: "metas",
    label: "3. Metas previstas × realizadas",
    descricao:
      "Quadro comparativo entre o previsto no Plano de Trabalho e o efetivamente realizado.",
  },
  {
    key: "parcerias",
    label: "4. Parcerias e articulação institucional",
    descricao:
      "Parcerias formalizadas com poder público, sociedade civil e iniciativa privada.",
  },
  {
    key: "monitoramento",
    label: "5. Monitoramento e acompanhamento",
    descricao:
      "Como a execução foi monitorada (visitas, reuniões, sistemas, presenças, evasão).",
  },
  {
    key: "material",
    label: "6. Material comprobatório",
    descricao:
      "Evidências apresentadas: listas de presença, registros fotográficos, atas, ofícios.",
  },
  {
    key: "objetivos",
    label: "7. Objetivos e resultados alcançados",
    descricao:
      "Quais objetivos do Plano de Trabalho foram atingidos e em que grau.",
  },
  {
    key: "avaliacao",
    label: "8. Avaliação dos resultados",
    descricao:
      "Análise qualitativa: impacto nas beneficiárias, dificuldades enfrentadas, ajustes.",
  },
] as const;

export type SecaoKey = (typeof SECOES_PARCIAL_OBJETO)[number]["key"];

export type SecaoConteudo = {
  texto?: string;
  contexto_ia?: string;
  atualizado_em?: string;
};

export type RascunhoParcialObjeto = {
  id: string;
  projeto_id: string;
  ciclo: number | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  titulo: string | null;
  status: "rascunho" | "revisado" | "exportado";
  secoes: Record<string, SecaoConteudo>;
  contexto: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
};

export function rascunhosPorProjetoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["relatorios", "parcial-objeto", "list", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: RascunhoParcialObjeto[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      const { data, error } = await supabase
        .from("relatorios_parcial_objeto")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("atualizado_em", { ascending: false });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as RascunhoParcialObjeto[] };
    },
  });
}

export function rascunhoParcialObjetoOptions(id: string | null) {
  return queryOptions({
    queryKey: ["relatorios", "parcial-objeto", "item", id],
    enabled: !!id,
    queryFn: async (): Promise<{ row: RascunhoParcialObjeto | null; error?: string }> => {
      if (!id) return { row: null };
      const { data, error } = await supabase
        .from("relatorios_parcial_objeto")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) return { row: null, error: error.message };
      return { row: (data as RascunhoParcialObjeto) ?? null };
    },
  });
}

export function tituloRascunho(r: Pick<RascunhoParcialObjeto, "titulo" | "ciclo" | "periodo_inicio" | "periodo_fim">): string {
  if (r.titulo && r.titulo.trim()) return r.titulo;
  const partes: string[] = ["Relatório Parcial de Execução do Objeto"];
  if (r.ciclo != null) partes.push(`Ciclo ${r.ciclo}`);
  if (r.periodo_inicio || r.periodo_fim) {
    const ini = r.periodo_inicio ? formatarDataCurta(r.periodo_inicio) : "?";
    const fim = r.periodo_fim ? formatarDataCurta(r.periodo_fim) : "?";
    partes.push(`(${ini} — ${fim})`);
  }
  return partes.join(" · ");
}

export function formatarDataCurta(v: string | null | undefined): string {
  if (!v) return "—";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(v);
}

export function statusLabel(s: RascunhoParcialObjeto["status"]): string {
  switch (s) {
    case "revisado":
      return "Revisado";
    case "exportado":
      return "Exportado";
    default:
      return "Rascunho";
  }
}

export function statusClass(s: RascunhoParcialObjeto["status"]): string {
  switch (s) {
    case "revisado":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "exportado":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    default:
      return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  }
}