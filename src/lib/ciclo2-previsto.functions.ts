// Cria as 6 turmas previstas do Ciclo 2 (C2-01..C2-06) para que o
// cronograma exportado contemple as 12 turmas exigidas pelo Ofício
// 49148/2026. As turmas ficam marcadas como "prevista — condicionada
// à 2ª parcela" em `observacoes` e recebem uma aula-placeholder sem
// data, para aparecer no cronograma consolidado.
// Idempotente por `codigo_turma`.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO } from "@/lib/rbac-guard";

export const CICLO2_MUNICIPIOS = [
  "Betim",
  "Betim",
  "Betim",
  "Juatuba",
  "Juatuba",
  "Juatuba",
] as const;

export type ResumoCiclo2 = {
  turmas_criadas: number;
  turmas_existentes: number;
  aulas_placeholder_criadas: number;
  inconsistencias: string[];
};

const OBSERVACAO_PREVISTA =
  "Turma prevista — condicionada à liberação da 2ª parcela (Ciclo 2)";

export const criarTurmasCiclo2Previstas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async ({ context }): Promise<ResumoCiclo2> => {
    const roleQ = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "coordenador_geral")
      .limit(1)
      .maybeSingle();
    if (roleQ.error) throw new Error(roleQ.error.message);
    if (!roleQ.data) {
      throw new Error(
        "Apenas a coordenação geral pode criar as turmas previstas do Ciclo 2.",
      );
    }

    const { getSupabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const admin = getSupabaseAdmin();

    const resumo: ResumoCiclo2 = {
      turmas_criadas: 0,
      turmas_existentes: 0,
      aulas_placeholder_criadas: 0,
      inconsistencias: [],
    };

    for (let i = 0; i < 6; i += 1) {
      const num = String(i + 1).padStart(2, "0");
      const codigo = `C2-${num}`;
      const municipio = CICLO2_MUNICIPIOS[i];

      const existQ = await admin
        .from("turmas")
        .select("id, codigo_turma")
        .ilike("codigo_turma", codigo)
        .limit(1)
        .maybeSingle();
      if (existQ.error) throw new Error(`turmas SELECT: ${existQ.error.message}`);

      let turmaId: string;
      const payload: Record<string, unknown> = {
        executora: "QUINTA ARTE",
        nome_curso: "Mulheres Conectadas (Ciclo 2 — previsto)",
        codigo_turma: codigo,
        turno: "A definir",
        horario_realizacao: "A definir",
        ch_conhecimentos_gerais: 0,
        ch_conhecimentos_especificos: 150,
        ch_total: 150,
        vagas: 50,
        municipio,
        ciclo: 2,
        observacoes: OBSERVACAO_PREVISTA,
      };

      if (existQ.data) {
        turmaId = (existQ.data as { id: string }).id;
        resumo.turmas_existentes += 1;
      } else {
        let ins = await admin.from("turmas").insert(payload).select("id").single();
        if (ins.error && /observacoes/i.test(ins.error.message)) {
          delete payload.observacoes;
          ins = await admin.from("turmas").insert(payload).select("id").single();
          resumo.inconsistencias.push(
            "Coluna observacoes não existe em turmas — status 'prevista' não foi gravado.",
          );
        }
        if (ins.error) throw new Error(`turmas INSERT (${codigo}): ${ins.error.message}`);
        turmaId = (ins.data as { id: string }).id;
        resumo.turmas_criadas += 1;
      }

      // Placeholder de aula (sem data) para aparecer no cronograma exportado
      const aulaQ = await admin
        .from("aulas")
        .select("id")
        .eq("turma_id", turmaId)
        .is("data", null)
        .ilike("conteudo_programatico", "%prevista%")
        .limit(1)
        .maybeSingle();
      if (aulaQ.error) throw new Error(`aulas SELECT: ${aulaQ.error.message}`);
      if (!aulaQ.data) {
        const ins = await admin.from("aulas").insert({
          turma_id: turmaId,
          data: null,
          hora_inicio: null,
          hora_fim: null,
          ch_prevista: 150,
          ch_ministrada: 0,
          tipo_ch: "especifico",
          conteudo_programatico:
            "Turma prevista (Ciclo 2) — 150h · condicionada à 2ª parcela",
          instrutor: null,
          observacoes: OBSERVACAO_PREVISTA,
        });
        if (ins.error) throw new Error(`aulas INSERT (${codigo}): ${ins.error.message}`);
        resumo.aulas_placeholder_criadas += 1;
      }
    }

    return resumo;
  });