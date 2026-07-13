import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Agrega dados para o módulo Relatórios. Todas as queries são defensivas:
// se uma tabela/coluna não existir, o dado cai para null/0 e a UI mostra "—".

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

// -------- Utilitários compartilhados --------

function pickStr(row: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}
function pickNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

// -------- Aba 1: Frequência por turma --------

export type FrequenciaCursista = {
  cursistaId: string;
  nome: string;
  aulasTotal: number;
  presencas: number;
  faltas: number;
  pct: number; // 0..100
};
export type FrequenciaTurma = {
  turmaId: string;
  turmaNome: string;
  aulasTotal: number;
  cursistas: FrequenciaCursista[];
};
export type FrequenciaResumo = {
  turmas: FrequenciaTurma[];
  errors: string[];
};

async function detectarTabelaFrequencia(): Promise<"frequencias" | "presencas" | null> {
  // Preferir `presencas` (fonte de verdade — é onde a Fiscalização MTE grava).
  // `frequencias` pode existir como tabela/view legada desatualizada.
  for (const t of ["presencas", "frequencias"] as const) {
    const r = await supabase.from(t).select("id", { head: true, count: "exact" }).limit(1);
    if (!r.error) return t;
  }
  return null;
}

export function frequenciaResumoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["relatorios", "frequencia", projetoId],
    enabled: !!projetoId,
    staleTime: 30_000,
    queryFn: async (): Promise<FrequenciaResumo> => {
      const errors: string[] = [];
      if (!projetoId) return { turmas: [], errors };
      const turmasRes = await supabase.from("turmas").select("*").eq("projeto_id", projetoId);
      if (turmasRes.error) return { turmas: [], errors: [`turmas: ${turmasRes.error.message}`] };
      const turmas = (turmasRes.data ?? []) as Array<Record<string, unknown> & { id: string }>;
      if (!turmas.length) return { turmas: [], errors };

      const tabFreq = await detectarTabelaFrequencia();

      const result: FrequenciaTurma[] = [];
      for (const t of turmas) {
        // Aulas
        const aulasRes = await supabase.from("aulas").select("id").eq("turma_id", t.id);
        if (aulasRes.error) {
          errors.push(`aulas(${t.id}): ${aulasRes.error.message}`);
          continue;
        }
        const aulaIds = ((aulasRes.data ?? []) as Array<{ id: string }>).map((a) => a.id);

        // Matrículas + cursistas
        let matRes = await supabase
          .from("matriculas")
          .select("*, cursistas(*)")
          .eq("turma_id", t.id);
        if (matRes.error) {
          matRes = await supabase.from("matriculas").select("*").eq("turma_id", t.id);
        }
        if (matRes.error) {
          errors.push(`matriculas(${t.id}): ${matRes.error.message}`);
          continue;
        }
        const matriculas = (matRes.data ?? []) as Array<Record<string, unknown> & { id: string }>;

        // Frequência
        const presencasPorMatricula = new Map<string, number>();
        if (tabFreq && aulaIds.length && matriculas.length) {
          const fr = await supabase
            .from(tabFreq)
            .select("matricula_id, presente")
            .in("aula_id", aulaIds);
          if (fr.error) {
            errors.push(`${tabFreq}(${t.id}): ${fr.error.message}`);
          } else {
            for (const row of (fr.data ?? []) as Array<{ matricula_id: string; presente: boolean | null }>) {
              if (row.presente) {
                presencasPorMatricula.set(row.matricula_id, (presencasPorMatricula.get(row.matricula_id) ?? 0) + 1);
              }
            }
          }
        }

        const cursistas: FrequenciaCursista[] = matriculas.map((m) => {
          const c = (m.cursistas as Record<string, unknown> | null) ?? null;
          const nome =
            pickStr(c, ["nome", "nome_completo"]) ??
            pickStr(m, ["nome", "nome_completo"]) ??
            "—";
          const presencas = presencasPorMatricula.get(m.id) ?? 0;
          const pct = aulaIds.length ? (presencas / aulaIds.length) * 100 : 0;
          return {
            cursistaId: (m.id as string),
            nome,
            aulasTotal: aulaIds.length,
            presencas,
            faltas: Math.max(0, aulaIds.length - presencas),
            pct,
          };
        });
        cursistas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

        result.push({
          turmaId: t.id,
          turmaNome:
            pickStr(t, ["nome", "titulo", "descricao", "codigo_turma", "nome_curso"]) ??
            "Turma sem nome",
          aulasTotal: aulaIds.length,
          cursistas,
        });
      }

      result.sort((a, b) => a.turmaNome.localeCompare(b.turmaNome, "pt-BR"));
      return { turmas: result, errors };
    },
  });
}

// -------- Aba 2: Pedagógico (qualificação por turma) --------

export type PedagogicoTurma = {
  turmaId: string;
  turmaNome: string;
  matriculados: number;
  qualificados: number;
  certificados: number;
  taxa: number; // %
};
export type PedagogicoResumo = {
  turmas: PedagogicoTurma[];
  totalMatriculados: number;
  totalQualificados: number;
  totalCertificados: number;
  errors: string[];
};

export function pedagogicoResumoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["relatorios", "pedagogico", projetoId],
    enabled: !!projetoId,
    staleTime: 30_000,
    queryFn: async (): Promise<PedagogicoResumo> => {
      const errors: string[] = [];
      const empty: PedagogicoResumo = {
        turmas: [],
        totalMatriculados: 0,
        totalQualificados: 0,
        totalCertificados: 0,
        errors,
      };
      if (!projetoId) return empty;
      const turmasRes = await supabase.from("turmas").select("*").eq("projeto_id", projetoId);
      if (turmasRes.error) {
        errors.push(`turmas: ${turmasRes.error.message}`);
        return empty;
      }
      const turmas = (turmasRes.data ?? []) as Array<Record<string, unknown> & { id: string }>;
      const result: PedagogicoTurma[] = [];
      let totMat = 0, totQual = 0, totCert = 0;
      for (const t of turmas) {
        const matRes = await supabase
          .from("matriculas")
          .select("id", { count: "exact", head: true })
          .eq("turma_id", t.id);
        if (matRes.error) errors.push(`matriculas(${t.id}): ${matRes.error.message}`);
        const matriculados = matRes.count ?? 0;

        // Qualificados: tenta por turma_id direto
        let qualCount = 0;
        let certCount = 0;
        const q1 = await supabase
          .from("qualificados")
          .select("certificado_url", { count: "exact" })
          .eq("turma_id", t.id);
        if (q1.error) {
          errors.push(`qualificados(${t.id}): ${q1.error.message}`);
        } else {
          qualCount = q1.count ?? (q1.data?.length ?? 0);
          certCount = ((q1.data ?? []) as Array<{ certificado_url: string | null }>)
            .filter((r) => !!r.certificado_url).length;
        }

        const taxa = matriculados > 0 ? (qualCount / matriculados) * 100 : 0;
        totMat += matriculados;
        totQual += qualCount;
        totCert += certCount;
        result.push({
          turmaId: t.id,
          turmaNome:
            pickStr(t, ["nome", "titulo", "descricao", "codigo_turma", "nome_curso"]) ??
            "Turma sem nome",
          matriculados,
          qualificados: qualCount,
          certificados: certCount,
          taxa,
        });
      }
      result.sort((a, b) => a.turmaNome.localeCompare(b.turmaNome, "pt-BR"));
      return {
        turmas: result,
        totalMatriculados: totMat,
        totalQualificados: totQual,
        totalCertificados: totCert,
        errors,
      };
    },
  });
}

// -------- Aba 3: Orçamentário --------

export type OrcamentoRubrica = {
  categoria: string;
  previsto: number;
  executado: number;
  pct: number;
};
export type OrcamentoResumo = {
  rubricas: OrcamentoRubrica[];
  totalPrevisto: number;
  totalExecutado: number;
  pctTotal: number;
  errors: string[];
};

export function orcamentoResumoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["relatorios", "orcamento", projetoId],
    enabled: !!projetoId,
    staleTime: 30_000,
    queryFn: async (): Promise<OrcamentoResumo> => {
      const errors: string[] = [];
      const empty: OrcamentoResumo = {
        rubricas: [],
        totalPrevisto: 0,
        totalExecutado: 0,
        pctTotal: 0,
        errors,
      };
      if (!projetoId) return empty;
      const orcRes = await supabase
        .from("orcamento_itens")
        .select("*")
        .eq("projeto_id", projetoId);
      if (orcRes.error) {
        errors.push(`orcamento_itens: ${orcRes.error.message}`);
        return empty;
      }
      const rows = (orcRes.data ?? []) as Array<Record<string, unknown>>;
      const acc = new Map<string, { previsto: number; executado: number }>();
      for (const r of rows) {
        const cat =
          pickStr(r, ["categoria", "rubrica", "grupo", "descricao"]) ?? "Sem categoria";
        const cur = acc.get(cat) ?? { previsto: 0, executado: 0 };
        cur.previsto += pickNum(r.valor_previsto);
        cur.executado += pickNum(r.valor_executado);
        acc.set(cat, cur);
      }
      const rubricas: OrcamentoRubrica[] = Array.from(acc.entries()).map(([categoria, v]) => ({
        categoria,
        previsto: v.previsto,
        executado: v.executado,
        pct: v.previsto > 0 ? (v.executado / v.previsto) * 100 : 0,
      }));
      rubricas.sort((a, b) => b.previsto - a.previsto);
      const totalPrevisto = rubricas.reduce((s, r) => s + r.previsto, 0);
      const totalExecutado = rubricas.reduce((s, r) => s + r.executado, 0);
      return {
        rubricas,
        totalPrevisto,
        totalExecutado,
        pctTotal: totalPrevisto > 0 ? (totalExecutado / totalPrevisto) * 100 : 0,
        errors,
      };
    },
  });
}

// -------- Aba 4: Metas do projeto --------

export type MetasResumo = {
  cursistas: { meta: number; real: number };
  turmas: { meta: number; real: number };
  horas: { meta: number; real: number };
  municipios: { meta: number | null; real: number; lista: string[] };
  errors: string[];
};

// Metas padrão do projeto (600 / 12 / 150h). Se colunas existirem em `projetos`, são usadas.
const METAS_PADRAO = { cursistas: 600, turmas: 12, horas: 150 };

export function metasResumoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["relatorios", "metas", projetoId],
    enabled: !!projetoId,
    staleTime: 30_000,
    queryFn: async (): Promise<MetasResumo> => {
      const errors: string[] = [];
      const base: MetasResumo = {
        cursistas: { meta: METAS_PADRAO.cursistas, real: 0 },
        turmas: { meta: METAS_PADRAO.turmas, real: 0 },
        horas: { meta: METAS_PADRAO.horas, real: 0 },
        municipios: { meta: null, real: 0, lista: [] },
        errors,
      };
      if (!projetoId) return base;

      // Projeto — busca metas customizadas se existirem
      const projRes = await supabase.from("projetos").select("*").eq("id", projetoId).maybeSingle();
      if (projRes.error) errors.push(`projetos: ${projRes.error.message}`);
      const proj = (projRes.data ?? null) as Record<string, unknown> | null;
      if (proj) {
        const mc = pickNum(proj.meta_cursistas);
        const mt = pickNum(proj.meta_turmas);
        const mh = pickNum(proj.meta_horas);
        const mm = pickNum(proj.meta_municipios);
        if (mc > 0) base.cursistas.meta = mc;
        if (mt > 0) base.turmas.meta = mt;
        if (mh > 0) base.horas.meta = mh;
        if (mm > 0) base.municipios.meta = mm;
      }

      // Turmas reais
      const turmasCountRes = await supabase
        .from("turmas")
        .select("id", { count: "exact", head: true })
        .eq("projeto_id", projetoId);
      if (turmasCountRes.error) errors.push(`turmas: ${turmasCountRes.error.message}`);
      base.turmas.real = turmasCountRes.count ?? 0;

      // Turmas com dados para horas
      const turmasRes = await supabase.from("turmas").select("*").eq("projeto_id", projetoId);
      const turmas = (turmasRes.data ?? []) as Array<Record<string, unknown> & { id: string }>;
      const turmaIds = turmas.map((t) => t.id);

      // Cursistas ativas (matriculas)
      if (turmaIds.length) {
        const matRes = await supabase
          .from("matriculas")
          .select("id", { count: "exact", head: true })
          .in("turma_id", turmaIds);
        if (matRes.error) errors.push(`matriculas: ${matRes.error.message}`);
        base.cursistas.real = matRes.count ?? 0;
      }

      // Horas realizadas — soma duração das aulas passadas (fallback: 2h por aula)
      if (turmaIds.length) {
        const aulasRes = await supabase
          .from("aulas")
          .select("data, duracao")
          .in("turma_id", turmaIds);
        if (aulasRes.error) {
          errors.push(`aulas: ${aulasRes.error.message}`);
        } else {
          const hoje = new Date();
          const aulas = (aulasRes.data ?? []) as Array<{ data: string | null; duracao: number | null }>;
          let horas = 0;
          for (const a of aulas) {
            if (a.data) {
              const d = new Date(a.data);
              if (Number.isNaN(d.getTime()) || d > hoje) continue;
            }
            const dur = pickNum(a.duracao);
            horas += dur > 0 ? dur : 2;
          }
          base.horas.real = horas;
        }
      }

      // Municípios atendidos — deduplica campo `municipio`/`cidade` de cursistas/turmas
      const municipios = new Set<string>();
      // Tenta pelas turmas
      for (const t of turmas) {
        const m = pickStr(t, ["municipio", "cidade"]);
        if (m) municipios.add(m.trim());
      }
      // Cursistas via matriculas → cursistas
      if (turmaIds.length) {
        const mCur = await supabase
          .from("matriculas")
          .select("cursistas(*)")
          .in("turma_id", turmaIds);
        if (!mCur.error) {
          for (const row of (mCur.data ?? []) as Array<{ cursistas: unknown }>) {
            const c = row.cursistas;
            const cur = Array.isArray(c)
              ? (c[0] as Record<string, unknown> | undefined)
              : (c as Record<string, unknown> | null | undefined);
            const m = pickStr(cur ?? null, ["municipio", "cidade"]);
            if (m) municipios.add(m.trim());
          }
        }
      }
      base.municipios.lista = Array.from(municipios).sort((a, b) => a.localeCompare(b, "pt-BR"));
      base.municipios.real = base.municipios.lista.length;

      return base;
    },
  });
}