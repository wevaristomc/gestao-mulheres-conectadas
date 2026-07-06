import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Agrega KPIs de acompanhamento de um projeto. Descoberta de colunas em runtime:
// se uma tabela/coluna não existir, o KPI cai para null e a UI mostra "—".

export type AcompanhamentoResumo = {
  projeto: { id: string; nome: string | null; data_inicio: string | null; data_fim: string | null; valor_global: number | null } | null;
  turmas: number | null;
  aulasRealizadas: number | null;
  aulasPrevistas: number | null;
  cursistasAtivas: number | null;
  frequenciaMedia: number | null; // percentual 0..100
  execucaoOrcamentaria: { previsto: number; executado: number; pct: number } | null;
  diasRestantes: number | null;
  errors: string[];
};

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function acompanhamentoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["relatorios", "acompanhamento", projetoId],
    enabled: !!projetoId,
    staleTime: 30_000,
    queryFn: async (): Promise<AcompanhamentoResumo> => {
      const errors: string[] = [];
      const empty: AcompanhamentoResumo = {
        projeto: null,
        turmas: null,
        aulasRealizadas: null,
        aulasPrevistas: null,
        cursistasAtivas: null,
        frequenciaMedia: null,
        execucaoOrcamentaria: null,
        diasRestantes: null,
        errors,
      };
      if (!projetoId) return empty;

      // Projeto
      const projRes = await supabase.from("projetos").select("*").eq("id", projetoId).maybeSingle();
      if (projRes.error) errors.push(`projetos: ${projRes.error.message}`);
      const projRow = (projRes.data ?? null) as Record<string, unknown> | null;
      const projeto = projRow
        ? {
            id: projetoId,
            nome: pickString(projRow.nome) ?? pickString(projRow.titulo),
            data_inicio: pickString(projRow.data_inicio) ?? pickString(projRow.inicio),
            data_fim: pickString(projRow.data_fim) ?? pickString(projRow.fim) ?? pickString(projRow.vigencia_fim),
            valor_global: pickNumber(projRow.valor_global) ?? pickNumber(projRow.valor_total),
          }
        : null;

      // Turmas do projeto
      const turmasRes = await supabase
        .from("turmas")
        .select("id", { count: "exact", head: true })
        .eq("projeto_id", projetoId);
      if (turmasRes.error) errors.push(`turmas: ${turmasRes.error.message}`);
      const turmas = turmasRes.count ?? null;

      // Aulas realizadas × previstas (via turmas do projeto)
      const turmaIdsRes = await supabase.from("turmas").select("id").eq("projeto_id", projetoId);
      const turmaIds = ((turmaIdsRes.data ?? []) as Array<{ id: string }>).map((t) => t.id);
      let aulasRealizadas: number | null = null;
      let aulasPrevistas: number | null = null;
      if (turmaIds.length) {
        const aulasRes = await supabase.from("aulas").select("data").in("turma_id", turmaIds);
        if (aulasRes.error) {
          errors.push(`aulas: ${aulasRes.error.message}`);
        } else {
          const aulas = (aulasRes.data ?? []) as Array<{ data: string | null }>;
          aulasPrevistas = aulas.length;
          const hoje = new Date();
          aulasRealizadas = aulas.filter((a) => {
            if (!a.data) return false;
            const d = new Date(a.data);
            return !Number.isNaN(d.getTime()) && d <= hoje;
          }).length;
        }
      } else {
        aulasPrevistas = 0;
        aulasRealizadas = 0;
      }

      // Cursistas ativas
      let cursistasAtivas: number | null = null;
      if (turmaIds.length) {
        const matRes = await supabase
          .from("matriculas")
          .select("id", { count: "exact", head: true })
          .in("turma_id", turmaIds);
        if (matRes.error) errors.push(`matriculas: ${matRes.error.message}`);
        else cursistasAtivas = matRes.count ?? 0;
      } else {
        cursistasAtivas = 0;
      }

      // Frequência média — tenta frequencias, depois presencas.
      let frequenciaMedia: number | null = null;
      if (turmaIds.length) {
        const aulasIdsRes = await supabase.from("aulas").select("id").in("turma_id", turmaIds);
        const aulaIds = ((aulasIdsRes.data ?? []) as Array<{ id: string }>).map((a) => a.id);
        if (aulaIds.length) {
          for (const tabela of ["frequencias", "presencas"] as const) {
            const r = await supabase.from(tabela).select("presente").in("aula_id", aulaIds);
            if (!r.error) {
              const linhas = (r.data ?? []) as Array<{ presente: boolean | null }>;
              if (linhas.length) {
                const presentes = linhas.filter((l) => l.presente === true).length;
                frequenciaMedia = (presentes / linhas.length) * 100;
              } else {
                frequenciaMedia = 0;
              }
              break;
            }
          }
        } else {
          frequenciaMedia = 0;
        }
      }

      // Execução orçamentária
      let execucao: AcompanhamentoResumo["execucaoOrcamentaria"] = null;
      const orcRes = await supabase
        .from("orcamento_itens")
        .select("valor_previsto, valor_executado")
        .eq("projeto_id", projetoId);
      if (orcRes.error) {
        errors.push(`orcamento_itens: ${orcRes.error.message}`);
      } else {
        const rows = (orcRes.data ?? []) as Array<{ valor_previsto: number | null; valor_executado: number | null }>;
        const previsto = rows.reduce((s, r) => s + Number(r.valor_previsto ?? 0), 0);
        const executado = rows.reduce((s, r) => s + Number(r.valor_executado ?? 0), 0);
        execucao = { previsto, executado, pct: previsto > 0 ? (executado / previsto) * 100 : 0 };
      }

      // Dias restantes
      let diasRestantes: number | null = null;
      if (projeto?.data_fim) {
        const fim = new Date(projeto.data_fim);
        if (!Number.isNaN(fim.getTime())) {
          const diff = Math.ceil((fim.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          diasRestantes = diff;
        }
      }

      return {
        projeto,
        turmas,
        aulasRealizadas,
        aulasPrevistas,
        cursistasAtivas,
        frequenciaMedia,
        execucaoOrcamentaria: execucao,
        diasRestantes,
        errors,
      };
    },
  });
}

export function formatarPercent(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}
export function formatarMoeda(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}