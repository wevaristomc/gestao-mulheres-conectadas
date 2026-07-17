import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { nomeTurma } from "@/lib/pedagogico-queries";

type Row = Record<string, unknown> & { id: string };

export type OrigemQualificacao = "manual" | "lote" | "criterio";

export type QualificacaoCertificado = {
  id: string;
  certificadoEmitido: boolean;
  certificadoUrl: string | null;
  qualificadoEm: string | null;
  origem: OrigemQualificacao | null;
  observacao: string | null;
};

export type MatriculaQualificacao = {
  matriculaId: string;
  cursistaId: string | null;
  nome: string;
  turmaId: string;
  turmaNome: string;
  status: string;
  frequenciaPercentual: number;
  presencas: number;
  aulasLancadas: number;
  qualificacao: QualificacaoCertificado | null;
};

export type TurmaQualificacao = {
  id: string;
  nome: string;
};

export type QualificacaoCertificadoData = {
  rows: MatriculaQualificacao[];
  turmas: TurmaQualificacao[];
};

function asRow(value: unknown): Row | null {
  if (!value || typeof value !== "object") return null;
  return value as Row;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function chunks<T>(values: T[], size = 200): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function carregarEmLotes(
  tabela: string,
  coluna: string,
  ids: string[],
  select = "*",
): Promise<Row[]> {
  if (ids.length === 0) return [];
  const grupos = chunks(ids);
  const respostas = await Promise.all(
    grupos.map((grupo) => supabase.from(tabela).select(select).in(coluna, grupo)),
  );
  const erro = respostas.find((resposta) => resposta.error)?.error;
  if (erro) throw new Error(erro.message);
  return respostas.flatMap((resposta) => (resposta.data ?? []) as unknown as Row[]);
}

function nomeCursista(matricula: Row): string {
  const cursista = asRow(matricula.cursistas);
  const beneficiaria = asRow(matricula.beneficiarias);
  return (
    text(cursista?.nome) ??
    text(cursista?.nome_completo) ??
    text(beneficiaria?.nome) ??
    text(beneficiaria?.nome_completo) ??
    text(matricula.nome) ??
    "—"
  );
}

export function qualificacaoCertificadoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["administrativo", "qualificacao-certificado", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<QualificacaoCertificadoData> => {
      if (!projetoId) return { rows: [], turmas: [] };

      const turmasRes = await supabase.from("turmas").select("*").eq("projeto_id", projetoId);
      if (turmasRes.error) throw new Error(turmasRes.error.message);

      const turmasRows = (turmasRes.data ?? []) as Row[];
      const turmas = turmasRows
        .map((turma) => ({ id: turma.id, nome: nomeTurma(turma as never) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      const turmaIds = turmas.map((turma) => turma.id);
      if (turmaIds.length === 0) return { rows: [], turmas };

      let matriculas: Row[] = [];
      try {
        matriculas = await carregarEmLotes(
          "matriculas",
          "turma_id",
          turmaIds,
          "*, cursistas(*), beneficiarias(*)",
        );
      } catch {
        matriculas = await carregarEmLotes("matriculas", "turma_id", turmaIds);
      }

      const matriculaIds = matriculas.map((matricula) => matricula.id);
      const aulas = await carregarEmLotes("aulas", "turma_id", turmaIds, "id, turma_id");
      const aulaIds = aulas.map((aula) => aula.id);

      const [presencas, qualificados] = await Promise.all([
        carregarEmLotes("presencas", "aula_id", aulaIds, "aula_id, matricula_id, presente"),
        carregarEmLotes("qualificados", "matricula_id", matriculaIds),
      ]);

      const turmaPorId = new Map(turmas.map((turma) => [turma.id, turma]));
      const turmaPorAula = new Map(aulas.map((aula) => [aula.id, text(aula.turma_id) ?? ""]));
      const aulasLancadasPorTurma = new Map<string, Set<string>>();
      const presencasPorMatricula = new Map<string, number>();

      for (const presenca of presencas) {
        const aulaId = text(presenca.aula_id);
        const matriculaId = text(presenca.matricula_id);
        if (!aulaId || !matriculaId) continue;
        const turmaId = turmaPorAula.get(aulaId);
        if (turmaId) {
          const lancadas = aulasLancadasPorTurma.get(turmaId) ?? new Set<string>();
          lancadas.add(aulaId);
          aulasLancadasPorTurma.set(turmaId, lancadas);
        }
        if (presenca.presente === true) {
          presencasPorMatricula.set(matriculaId, (presencasPorMatricula.get(matriculaId) ?? 0) + 1);
        }
      }

      const qualificacaoPorMatricula = new Map<string, Row>();
      for (const qualificacao of qualificados) {
        const matriculaId = text(qualificacao.matricula_id);
        if (matriculaId) qualificacaoPorMatricula.set(matriculaId, qualificacao);
      }

      const rows = matriculas.map((matricula): MatriculaQualificacao => {
        const turmaId = text(matricula.turma_id) ?? "";
        const aulasLancadas = aulasLancadasPorTurma.get(turmaId)?.size ?? 0;
        const totalPresencas = presencasPorMatricula.get(matricula.id) ?? 0;
        const frequenciaPercentual = aulasLancadas
          ? Math.min(100, (totalPresencas / aulasLancadas) * 100)
          : 0;
        const qualificacao = qualificacaoPorMatricula.get(matricula.id);
        return {
          matriculaId: matricula.id,
          cursistaId: text(matricula.cursista_id) ?? text(matricula.beneficiaria_id),
          nome: nomeCursista(matricula),
          turmaId,
          turmaNome: turmaPorId.get(turmaId)?.nome ?? "Turma não identificada",
          status: text(matricula.status) ?? "ativa",
          frequenciaPercentual,
          presencas: totalPresencas,
          aulasLancadas,
          qualificacao: qualificacao
            ? {
                id: qualificacao.id,
                certificadoEmitido: qualificacao.certificado_emitido === true,
                certificadoUrl: text(qualificacao.certificado_url),
                qualificadoEm:
                  text(qualificacao.qualificado_em) ?? text(qualificacao.data_qualificacao),
                origem: (text(qualificacao.origem) as OrigemQualificacao | null) ?? null,
                observacao: text(qualificacao.observacao) ?? text(qualificacao.observacoes),
              }
            : null,
        };
      });

      rows.sort((a, b) => {
        const turma = a.turmaNome.localeCompare(b.turmaNome, "pt-BR");
        return turma || a.nome.localeCompare(b.nome, "pt-BR");
      });
      return { rows, turmas };
    },
  });
}

function mensagemMigracao(error: { message?: string | null }): Error {
  const mensagem = error.message ?? "Erro desconhecido.";
  if (
    /qualificado_por|qualificado_em|origem|observacao|qualificados_matricula_uniq|unique constraint/i.test(
      mensagem,
    )
  ) {
    return new Error(
      "A migração de qualificação para certificado ainda não foi aplicada no Supabase.",
    );
  }
  return new Error(mensagem);
}

export async function qualificarMatriculas(input: {
  matriculaIds: string[];
  usuarioId: string;
  origem: OrigemQualificacao;
  observacao?: string | null;
}): Promise<number> {
  const ids = [...new Set(input.matriculaIds)];
  if (ids.length === 0) return 0;

  const existentes = await carregarEmLotes("qualificados", "matricula_id", ids, "matricula_id");
  const idsExistentes = new Set(existentes.map((row) => text(row.matricula_id)).filter(Boolean));
  const novosIds = ids.filter((id) => !idsExistentes.has(id));
  if (novosIds.length === 0) return 0;

  const payload = novosIds.map((matriculaId) => ({
    matricula_id: matriculaId,
    qualificado_por: input.usuarioId,
    origem: input.origem,
    observacao: input.observacao?.trim() || null,
  }));
  const { data, error } = await supabase
    .from("qualificados")
    .upsert(payload, { onConflict: "matricula_id", ignoreDuplicates: true })
    .select("matricula_id");
  if (error) throw mensagemMigracao(error);
  return data?.length ?? novosIds.length;
}

export async function removerQualificacao(input: { qualificacaoId: string }): Promise<void> {
  const { data, error } = await supabase
    .from("qualificados")
    .delete()
    .eq("id", input.qualificacaoId)
    .or("certificado_emitido.eq.false,certificado_emitido.is.null")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error("Não é possível remover uma qualificação com certificado emitido.");
  }
}
