// Server function que importa um dump SQL do Moodle já em storage.
// Todos os helpers vivem em moodle-import.server.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const importarDumpMoodle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        storage_path: z.string().min(1),
        arquivo_nome: z.string().nullish(),
        tamanho_bytes: z.number().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("@/lib/moodle-import.server");
    const { parseInserts, colIdx, toIso, toNum, toBool, pickCpf } = helpers;

    // Autoriza: apenas coordenação geral (padrão do app — ver rbac.functions.ts)
    const roleQ = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "coordenador_geral")
      .limit(1)
      .maybeSingle();
    if (roleQ.error) throw new Error(roleQ.error.message);
    if (!roleQ.data) {
      throw new Error("Apenas a coordenação geral pode importar dump do Moodle.");
    }

    const admin = getSupabaseAdmin();

    // Registro da importação
    const impIns = await admin
      .from("ava_importacoes")
      .insert({
        storage_path: data.storage_path,
        arquivo_nome: data.arquivo_nome ?? null,
        tamanho_bytes: data.tamanho_bytes ?? null,
        status: "processando",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (impIns.error) throw new Error(impIns.error.message);
    const importacaoId = (impIns.data as { id: string }).id;

    // Download do dump
    const dl = await admin.storage.from("evidencias").download(data.storage_path);
    if (dl.error || !dl.data) {
      await admin
        .from("ava_importacoes")
        .update({
          status: "erro",
          erro: dl.error?.message ?? "Falha ao baixar arquivo",
          terminado_em: new Date().toISOString(),
        })
        .eq("id", importacaoId);
      throw new Error(dl.error?.message ?? "Falha ao baixar arquivo");
    }

    const text = await dl.data.text();

    const resumo: Record<string, number> = {
      users: 0,
      courses: 0,
      enrolments: 0,
      activities: 0,
      completions: 0,
      grades: 0,
      matched_users: 0,
      matched_courses: 0,
    };

    // Caches locais (não usam module scope — sobrevivem ao splitter)
    const enrolToCourse = new Map<number, number>();
    const moduleNames = new Map<number, string>();
    const gradeItems: Map<
      number,
      { courseid: number | null; itemname: string | null; itemtype: string | null; grademax: number | null }
    > = new Map();

    // Parseia todos os INSERTs de uma vez (o parser filtra tabelas de interesse)
    const inserts = parseInserts(text);

    // Passada 1: dependências (pmc_enrol, pmc_modules, pmc_grade_items)
    for (const ins of inserts) {
      const idx = colIdx(ins.columns);
      if (ins.table === "pmc_enrol") {
        for (const r of ins.rows) {
          const id = toNum(r[idx.id ?? -1] ?? null);
          const courseid = toNum(r[idx.courseid ?? -1] ?? null);
          if (id != null && courseid != null) enrolToCourse.set(id, courseid);
        }
      } else if (ins.table === "pmc_modules") {
        for (const r of ins.rows) {
          const id = toNum(r[idx.id ?? -1] ?? null);
          const name = r[idx.name ?? -1] ?? null;
          if (id != null && name) moduleNames.set(id, name);
        }
      } else if (ins.table === "pmc_grade_items") {
        for (const r of ins.rows) {
          const gid = toNum(r[idx.id ?? -1] ?? null);
          const cid = toNum(r[idx.courseid ?? -1] ?? null);
          if (gid != null) {
            gradeItems.set(gid, {
              courseid: cid,
              itemname: r[idx.itemname ?? -1] ?? null,
              itemtype: r[idx.itemtype ?? -1] ?? null,
              grademax: toNum(r[idx.grademax ?? -1] ?? null),
            });
          }
        }
      }
    }

    // Passada 2: grava os dados
    for (const ins of inserts) {
      const idx = colIdx(ins.columns);
      try {
        if (ins.table === "pmc_user") {
          const rows = ins.rows
            .map((r) => {
              const id = toNum(r[idx.id ?? -1] ?? null);
              const username = r[idx.username ?? -1] ?? null;
              const idnumber = r[idx.idnumber ?? -1] ?? null;
              return {
                moodle_id: id,
                username,
                idnumber,
                email: r[idx.email ?? -1] ?? null,
                firstname: r[idx.firstname ?? -1] ?? null,
                lastname: r[idx.lastname ?? -1] ?? null,
                cpf: pickCpf(idnumber, username),
                lastaccess: toIso(r[idx.lastaccess ?? -1] ?? null),
              };
            })
            .filter((r) => r.moodle_id != null && (r.moodle_id ?? 0) > 2);
          for (let k = 0; k < rows.length; k += 500) {
            const slice = rows.slice(k, k + 500);
            const { error } = await admin.from("ava_users").upsert(slice, { onConflict: "moodle_id" });
            if (!error) resumo.users += slice.length;
          }
        } else if (ins.table === "pmc_course") {
          const rows = ins.rows
            .map((r) => ({
              moodle_id: toNum(r[idx.id ?? -1] ?? null),
              shortname: r[idx.shortname ?? -1] ?? null,
              fullname: r[idx.fullname ?? -1] ?? null,
              category: toNum(r[idx.category ?? -1] ?? null),
              startdate: toIso(r[idx.startdate ?? -1] ?? null),
              enddate: toIso(r[idx.enddate ?? -1] ?? null),
            }))
            .filter((r) => r.moodle_id != null && (r.moodle_id ?? 0) > 1);
          for (let k = 0; k < rows.length; k += 500) {
            const slice = rows.slice(k, k + 500);
            const { error } = await admin.from("ava_courses").upsert(slice, { onConflict: "moodle_id" });
            if (!error) resumo.courses += slice.length;
          }
        } else if (ins.table === "pmc_user_enrolments") {
          const rows = ins.rows
            .map((r) => {
              const enrolid = toNum(r[idx.enrolid ?? -1] ?? null);
              return {
                moodle_id: toNum(r[idx.id ?? -1] ?? null),
                ava_user_id: toNum(r[idx.userid ?? -1] ?? null),
                ava_course_id: enrolid != null ? enrolToCourse.get(enrolid) ?? null : null,
                status: toNum(r[idx.status ?? -1] ?? null),
                timestart: toIso(r[idx.timestart ?? -1] ?? null),
                timeend: toIso(r[idx.timeend ?? -1] ?? null),
                timecreated: toIso(r[idx.timecreated ?? -1] ?? null),
              };
            })
            .filter((r) => r.ava_user_id != null && r.ava_course_id != null);
          for (let k = 0; k < rows.length; k += 500) {
            const slice = rows.slice(k, k + 500);
            const { error } = await admin.from("ava_enrolments").upsert(slice, { onConflict: "moodle_id" });
            if (!error) resumo.enrolments += slice.length;
          }
        } else if (ins.table === "pmc_course_modules") {
          const rows = ins.rows
            .map((r) => {
              const moduleid = toNum(r[idx.module ?? -1] ?? null);
              return {
                moodle_cmid: toNum(r[idx.id ?? -1] ?? null),
                ava_course_id: toNum(r[idx.course ?? -1] ?? null),
                modulename: moduleid != null ? moduleNames.get(moduleid) ?? null : null,
                instance_id: toNum(r[idx.instance ?? -1] ?? null),
                nome: null as string | null,
                completion_enabled: toBool(r[idx.completion ?? -1] ?? null),
              };
            })
            .filter((r) => r.moodle_cmid != null);
          for (let k = 0; k < rows.length; k += 500) {
            const slice = rows.slice(k, k + 500);
            const { error } = await admin.from("ava_activities").upsert(slice, { onConflict: "moodle_cmid" });
            if (!error) resumo.activities += slice.length;
          }
        } else if (ins.table === "pmc_course_modules_completion") {
          const rows = ins.rows
            .map((r) => ({
              ava_user_id: toNum(r[idx.userid ?? -1] ?? null),
              ava_activity_id: toNum(r[idx.coursemoduleid ?? -1] ?? null),
              completionstate: toNum(r[idx.completionstate ?? -1] ?? null),
              timemodified: toIso(r[idx.timemodified ?? -1] ?? null),
            }))
            .filter((r) => r.ava_user_id != null && r.ava_activity_id != null);
          for (let k = 0; k < rows.length; k += 500) {
            const slice = rows.slice(k, k + 500);
            const { error } = await admin
              .from("ava_completions")
              .upsert(slice, { onConflict: "ava_user_id,ava_activity_id" });
            if (!error) resumo.completions += slice.length;
          }
        } else if (ins.table === "pmc_grade_grades") {
          const rows = ins.rows
            .map((r) => {
              const itemid = toNum(r[idx.itemid ?? -1] ?? null);
              const gi = itemid != null ? gradeItems.get(itemid) : null;
              return {
                ava_user_id: toNum(r[idx.userid ?? -1] ?? null),
                grade_item_id: itemid,
                ava_course_id: gi?.courseid ?? null,
                itemname: gi?.itemname ?? null,
                itemtype: gi?.itemtype ?? null,
                finalgrade: toNum(r[idx.finalgrade ?? -1] ?? null),
                rawgrademax: gi?.grademax ?? null,
                timemodified: toIso(r[idx.timemodified ?? -1] ?? null),
              };
            })
            .filter((r) => r.ava_user_id != null && r.grade_item_id != null);
          for (let k = 0; k < rows.length; k += 500) {
            const slice = rows.slice(k, k + 500);
            const { error } = await admin
              .from("ava_grades")
              .upsert(slice, { onConflict: "ava_user_id,grade_item_id" });
            if (!error) resumo.grades += slice.length;
          }
        }
      } catch {
        // não interrompe outras tabelas
      }
    }

    // Cruzamento pós-import: users ← beneficiarias (por CPF)
    const { data: benef } = await admin
      .from("beneficiarias")
      .select("id, cpf")
      .not("cpf", "is", null);
    if (benef) {
      const mapa = new Map<string, string>();
      for (const b of benef as { id: string; cpf: string }[]) mapa.set(b.cpf, b.id);
      const { data: users } = await admin
        .from("ava_users")
        .select("moodle_id, cpf")
        .not("cpf", "is", null)
        .is("beneficiaria_id", null);
      for (const u of (users ?? []) as { moodle_id: number; cpf: string }[]) {
        const bid = mapa.get(u.cpf);
        if (!bid) continue;
        await admin.from("ava_users").update({ beneficiaria_id: bid }).eq("moodle_id", u.moodle_id);
        resumo.matched_users += 1;
      }
    }

    // Cruzamento pós-import: courses ← turmas (por shortname/codigo)
    const { data: turmas } = await admin
      .from("turmas")
      .select("id, codigo_turma")
      .not("codigo_turma", "is", null);
    if (turmas) {
      const mapa = new Map<string, string>();
      for (const t of turmas as { id: string; codigo_turma: string }[]) {
        mapa.set(t.codigo_turma.toUpperCase().trim(), t.id);
      }
      const { data: cursos } = await admin
        .from("ava_courses")
        .select("moodle_id, shortname")
        .not("shortname", "is", null)
        .is("turma_id", null);
      for (const c of (cursos ?? []) as { moodle_id: number; shortname: string }[]) {
        const key = c.shortname.toUpperCase().trim();
        let tid = mapa.get(key);
        if (!tid) {
          for (const [k, v] of mapa.entries()) {
            if (key.includes(k) || k.includes(key)) {
              tid = v;
              break;
            }
          }
        }
        if (!tid) continue;
        await admin.from("ava_courses").update({ turma_id: tid }).eq("moodle_id", c.moodle_id);
        resumo.matched_courses += 1;
      }
    }

    await admin
      .from("ava_importacoes")
      .update({
        status: "concluido",
        terminado_em: new Date().toISOString(),
        resumo,
      })
      .eq("id", importacaoId);

    return { importacao_id: importacaoId, resumo };
  });