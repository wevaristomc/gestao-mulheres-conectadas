// Lista cursos do AVA que ainda não têm turma correspondente no sistema.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CursoSemTurma = {
  moodle_id: number;
  shortname: string | null;
  fullname: string | null;
  startdate: string | null;
  enddate: string | null;
  alunos: number;
};

export const listarCursosSemTurma = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ cursos: CursoSemTurma[] }> => {
    // Restringe a coordenação (mesma regra do import).
    const roleQ = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "coordenador_geral")
      .limit(1)
      .maybeSingle();
    if (roleQ.error) throw new Error(roleQ.error.message);
    if (!roleQ.data) throw new Error("Apenas a coordenação geral pode consultar esta lista.");

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("ava_courses")
      .select("moodle_id, shortname, fullname, startdate, enddate")
      .is("turma_id", null)
      .order("shortname", { ascending: true });
    if (error) throw new Error(error.message);

    const cursos = (data ?? []) as Array<{
      moodle_id: number;
      shortname: string | null;
      fullname: string | null;
      startdate: string | null;
      enddate: string | null;
    }>;

    // Contagem de alunos matriculados no AVA por curso (informativo)
    const contagem = new Map<number, number>();
    if (cursos.length > 0) {
      const ids = cursos.map((c) => c.moodle_id);
      const { data: enrols } = await admin
        .from("ava_enrolments")
        .select("ava_course_id")
        .in("ava_course_id", ids);
      for (const e of (enrols ?? []) as { ava_course_id: number | null }[]) {
        if (e.ava_course_id == null) continue;
        contagem.set(e.ava_course_id, (contagem.get(e.ava_course_id) ?? 0) + 1);
      }
    }

    return {
      cursos: cursos.map((c) => ({ ...c, alunos: contagem.get(c.moodle_id) ?? 0 })),
    };
  });