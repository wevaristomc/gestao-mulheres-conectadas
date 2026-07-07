import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AvaCourse = {
  moodle_id: number;
  shortname: string | null;
  fullname: string | null;
  startdate: string | null;
  enddate: string | null;
  turma_id: string | null;
};

export type AvaUser = {
  moodle_id: number;
  username: string | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  cpf: string | null;
  beneficiaria_id: string | null;
  lastaccess: string | null;
};

export function avaCoursesOptions() {
  return queryOptions({
    queryKey: ["ava", "courses"],
    queryFn: async (): Promise<{ rows: AvaCourse[]; error?: string }> => {
      const { data, error } = await supabase
        .from("ava_courses")
        .select("moodle_id, shortname, fullname, startdate, enddate, turma_id")
        .order("shortname", { ascending: true })
        .limit(500);
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as AvaCourse[] };
    },
  });
}

export function avaCourseStatsOptions(courseId: number | null) {
  return queryOptions({
    queryKey: ["ava", "course-stats", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      if (!courseId) return { alunos: [], atividades: 0 };
      const { data: enrol } = await supabase
        .from("ava_enrolments")
        .select("ava_user_id")
        .eq("ava_course_id", courseId);
      const userIds = Array.from(new Set((enrol ?? []).map((e) => (e as { ava_user_id: number }).ava_user_id)));
      if (!userIds.length) return { alunos: [], atividades: 0 };
      const { data: users } = await supabase
        .from("ava_users")
        .select("moodle_id, username, firstname, lastname, email, cpf, beneficiaria_id, lastaccess")
        .in("moodle_id", userIds);
      const { count: totalAtividades } = await supabase
        .from("ava_activities")
        .select("*", { count: "exact", head: true })
        .eq("ava_course_id", courseId);
      const { data: completions } = await supabase
        .from("ava_completions")
        .select("ava_user_id, completionstate, ava_activity_id, ava_activities!inner(ava_course_id)")
        .eq("ava_activities.ava_course_id", courseId);
      const contagem = new Map<number, number>();
      for (const c of (completions ?? []) as { ava_user_id: number; completionstate: number }[]) {
        if (c.completionstate && c.completionstate > 0) {
          contagem.set(c.ava_user_id, (contagem.get(c.ava_user_id) ?? 0) + 1);
        }
      }
      const { data: grades } = await supabase
        .from("ava_grades")
        .select("ava_user_id, finalgrade, itemtype")
        .eq("ava_course_id", courseId)
        .eq("itemtype", "course");
      const notaFinal = new Map<number, number>();
      for (const g of (grades ?? []) as { ava_user_id: number; finalgrade: number | null }[]) {
        if (g.finalgrade != null) notaFinal.set(g.ava_user_id, g.finalgrade);
      }
      const alunos = ((users ?? []) as AvaUser[]).map((u) => ({
        ...u,
        concluidas: contagem.get(u.moodle_id) ?? 0,
        nota_final: notaFinal.get(u.moodle_id) ?? null,
      }));
      return { alunos, atividades: totalAtividades ?? 0 };
    },
  });
}