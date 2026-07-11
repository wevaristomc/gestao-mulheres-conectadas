// Gera matrículas em `matriculas` a partir dos pares (ava_user → beneficiaria,
// ava_course → turma) já cruzados pela importação do dump do Moodle.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO } from "@/lib/rbac-guard";

type EnrolRow = {
  ava_user_id: number;
  ava_course_id: number;
  status: number | null;
  timeend: string | null;
};

export const gerarMatriculasDoAva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async ({ context }) => {
    // Somente coordenação geral (mesma regra do import do dump).
    const roleQ = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "coordenador_geral")
      .limit(1)
      .maybeSingle();
    if (roleQ.error) throw new Error(roleQ.error.message);
    if (!roleQ.data) {
      throw new Error("Apenas a coordenação geral pode gerar matrículas do AVA.");
    }

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // 1. usuários AVA cruzados com beneficiárias
    const usersQ = await admin
      .from("ava_users")
      .select("moodle_id, beneficiaria_id")
      .not("beneficiaria_id", "is", null);
    if (usersQ.error) throw new Error(usersQ.error.message);
    const userToBenef = new Map<number, string>();
    for (const u of (usersQ.data ?? []) as { moodle_id: number; beneficiaria_id: string }[]) {
      userToBenef.set(u.moodle_id, u.beneficiaria_id);
    }

    // 2. cursos AVA cruzados com turmas
    const coursesQ = await admin
      .from("ava_courses")
      .select("moodle_id, turma_id")
      .not("turma_id", "is", null);
    if (coursesQ.error) throw new Error(coursesQ.error.message);
    const courseToTurma = new Map<number, string>();
    for (const c of (coursesQ.data ?? []) as { moodle_id: number; turma_id: string }[]) {
      courseToTurma.set(c.moodle_id, c.turma_id);
    }

    // 3. matrículas AVA (enrolments) — paginação simples
    const enrolments: EnrolRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("ava_enrolments")
        .select("ava_user_id, ava_course_id, status, timeend")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as EnrolRow[];
      enrolments.push(...rows);
      if (rows.length < PAGE) break;
    }

    // 4. conclusões de curso (itemtype='course', finalgrade>0)
    const concluidosPorAluno = new Map<number, Set<number>>();
    const gradesQ = await admin
      .from("ava_grades")
      .select("ava_user_id, ava_course_id, finalgrade")
      .eq("itemtype", "course")
      .gt("finalgrade", 0);
    if (!gradesQ.error) {
      for (const g of (gradesQ.data ?? []) as {
        ava_user_id: number;
        ava_course_id: number | null;
        finalgrade: number | null;
      }[]) {
        if (g.ava_course_id == null) continue;
        const set = concluidosPorAluno.get(g.ava_user_id) ?? new Set<number>();
        set.add(g.ava_course_id);
        concluidosPorAluno.set(g.ava_user_id, set);
      }
    }

    // 5. matrículas existentes (para diferenciar criadas × atualizadas)
    const existentes = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("matriculas")
        .select("turma_id, beneficiaria_id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { turma_id: string; beneficiaria_id: string }[];
      for (const r of rows) existentes.add(`${r.turma_id}::${r.beneficiaria_id}`);
      if (rows.length < PAGE) break;
    }

    const agora = Date.now();
    const stamp = new Date().toISOString().slice(0, 10);

    type UpsertRow = {
      turma_id: string;
      beneficiaria_id: string;
      status: string;
      observacao_importacao: string;
    };

    const dedup = new Map<string, UpsertRow>();
    let ignoradas = 0;

    for (const e of enrolments) {
      const turma_id = courseToTurma.get(e.ava_course_id);
      const beneficiaria_id = userToBenef.get(e.ava_user_id);
      if (!turma_id || !beneficiaria_id) {
        ignoradas += 1;
        continue;
      }
      const chave = `${turma_id}::${beneficiaria_id}`;
      // Deriva status
      const concluiu = concluidosPorAluno.get(e.ava_user_id)?.has(e.ava_course_id) ?? false;
      const timeendMs = e.timeend ? Date.parse(e.timeend) : NaN;
      let status = "cursando";
      if (concluiu && (Number.isNaN(timeendMs) || timeendMs <= agora)) status = "concluinte";
      else if (e.status === 1) status = "evadida";
      dedup.set(chave, {
        turma_id,
        beneficiaria_id,
        status,
        observacao_importacao: `Gerada via AVA em ${stamp}`,
      });
    }

    const rows = Array.from(dedup.values());
    let criadas = 0;
    let atualizadas = 0;

    for (let k = 0; k < rows.length; k += 500) {
      const slice = rows.slice(k, k + 500);
      const { error } = await admin
        .from("matriculas")
        .upsert(slice, { onConflict: "turma_id,beneficiaria_id" });
      if (error) throw new Error(error.message);
      for (const r of slice) {
        if (existentes.has(`${r.turma_id}::${r.beneficiaria_id}`)) atualizadas += 1;
        else criadas += 1;
      }
    }

    return { criadas, atualizadas, ignoradas, total_pares: rows.length };
  });