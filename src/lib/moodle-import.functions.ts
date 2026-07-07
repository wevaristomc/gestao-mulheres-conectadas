// Server function para importar dump SQL do Moodle (MariaDB dump).
// Parseia INSERT INTOs das tabelas de interesse e grava em ava_*.
// Requer ADMIN (has_role) e usa o cliente admin dentro do handler.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TABELAS_ALVO = new Set([
  "pmc_user",
  "pmc_course",
  "pmc_user_enrolments",
  "pmc_enrol",
  "pmc_course_modules",
  "pmc_modules",
  "pmc_course_modules_completion",
  "pmc_grade_items",
  "pmc_grade_grades",
]);

type ParsedInsert = {
  table: string;
  columns: string[];
  rows: (string | null)[][];
};

/** Extrai valores de uma tupla SQL. */
function splitTuple(inner: string): (string | null)[] {
  const out: (string | null)[] = [];
  let i = 0;
  const n = inner.length;
  while (i < n) {
    // Skip whitespace and commas
    while (i < n && (inner[i] === " " || inner[i] === "\t" || inner[i] === ",")) i += 1;
    if (i >= n) break;
    if (inner[i] === "'") {
      // quoted string
      let s = "";
      i += 1;
      while (i < n) {
        const c = inner[i];
        if (c === "\\" && i + 1 < n) {
          const nx = inner[i + 1];
          if (nx === "n") s += "\n";
          else if (nx === "r") s += "\r";
          else if (nx === "t") s += "\t";
          else if (nx === "0") s += "\0";
          else s += nx;
          i += 2;
        } else if (c === "'") {
          if (i + 1 < n && inner[i + 1] === "'") {
            s += "'";
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          s += c;
          i += 1;
        }
      }
      out.push(s);
    } else {
      // unquoted (NULL, number)
      let s = "";
      while (i < n && inner[i] !== "," ) {
        s += inner[i];
        i += 1;
      }
      const t = s.trim();
      if (t.toUpperCase() === "NULL" || t === "") out.push(null);
      else out.push(t);
    }
  }
  return out;
}

/** Extrai tuplas de "VALUES (...), (...), ..." */
function splitValueRows(values: string): string[] {
  const rows: string[] = [];
  let i = 0;
  const n = values.length;
  let depth = 0;
  let start = -1;
  let inQuote = false;
  while (i < n) {
    const c = values[i];
    if (inQuote) {
      if (c === "\\" && i + 1 < n) { i += 2; continue; }
      if (c === "'") {
        if (i + 1 < n && values[i + 1] === "'") { i += 2; continue; }
        inQuote = false;
      }
      i += 1;
      continue;
    }
    if (c === "'") { inQuote = true; i += 1; continue; }
    if (c === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (c === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        rows.push(values.slice(start, i));
        start = -1;
      }
    }
    i += 1;
  }
  return rows;
}

/** Encontra `INSERT INTO \`table\` (cols) VALUES ...;` */
function parseInserts(chunk: string): ParsedInsert[] {
  const out: ParsedInsert[] = [];
  const re = /INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chunk))) {
    const table = match[1];
    if (!TABELAS_ALVO.has(table)) continue;
    const cols = match[2].split(",").map((c) => c.trim().replace(/^`|`$/g, ""));
    // Localiza o ';' final considerando aspas
    let i = re.lastIndex;
    let inQuote = false;
    while (i < chunk.length) {
      const c = chunk[i];
      if (inQuote) {
        if (c === "\\" && i + 1 < chunk.length) { i += 2; continue; }
        if (c === "'") {
          if (i + 1 < chunk.length && chunk[i + 1] === "'") { i += 2; continue; }
          inQuote = false;
        }
      } else if (c === "'") inQuote = true;
      else if (c === ";") break;
      i += 1;
    }
    const valuesBlock = chunk.slice(re.lastIndex, i);
    const tuples = splitValueRows(valuesBlock);
    const rows = tuples.map(splitTuple);
    out.push({ table, columns: cols, rows });
    re.lastIndex = i + 1;
  }
  return out;
}

function toIso(v: string | null): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}
function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toBool(v: string | null): boolean | null {
  if (v == null) return null;
  return v === "1" || v.toLowerCase() === "true";
}

function pickCpf(idnumber: string | null, username: string | null): string | null {
  for (const cand of [idnumber, username]) {
    if (!cand) continue;
    const digits = cand.replace(/\D+/g, "");
    if (digits.length === 11) return digits;
  }
  return null;
}

/** Constrói mapa nome→índice para acesso rápido. */
function colIdx(cols: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (let i = 0; i < cols.length; i += 1) m[cols[i]] = i;
  return m;
}

export const importarDumpMoodle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      storage_path: z.string().min(1),
      arquivo_nome: z.string().nullish(),
      tamanho_bytes: z.number().nullish(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verifica role admin
    const roleQ = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleQ.error || !roleQ.data) {
      throw new Error("Apenas administradores podem importar dump do Moodle.");
    }
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // Registra importação
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

    // Baixa arquivo do bucket "evidencias"
    const dl = await admin.storage.from("evidencias").download(data.storage_path);
    if (dl.error || !dl.data) {
      await admin.from("ava_importacoes").update({
        status: "erro", erro: dl.error?.message ?? "Falha ao baixar arquivo", terminado_em: new Date().toISOString(),
      }).eq("id", importacaoId);
      throw new Error(dl.error?.message ?? "Falha ao baixar arquivo");
    }

    const text = await dl.data.text();

    const resumo: Record<string, number> = {
      users: 0, courses: 0, enrolments: 0, activities: 0, completions: 0, grades: 0,
      matched_users: 0, matched_courses: 0,
    };

    // Precache: enrol.id -> courseid (necessário para user_enrolments)
    const enrolToCourse = new Map<number, number>();
    // moduleid -> name (assign/quiz/forum)
    const moduleNames = new Map<number, string>();

    // Faz 2 passadas: primeira p/ pmc_enrol e pmc_modules (dependências), depois o resto.
    for (const pass of [1, 2]) {
      const inserts = parseInserts(text);
      for (const ins of inserts) {
        const idx = colIdx(ins.columns);
        if (pass === 1 && ins.table === "pmc_enrol") {
          for (const r of ins.rows) {
            const id = toNum(r[idx.id ?? -1] ?? null);
            const courseid = toNum(r[idx.courseid ?? -1] ?? null);
            if (id != null && courseid != null) enrolToCourse.set(id, courseid);
          }
        }
        if (pass === 1 && ins.table === "pmc_modules") {
          for (const r of ins.rows) {
            const id = toNum(r[idx.id ?? -1] ?? null);
            const name = r[idx.name ?? -1] ?? null;
            if (id != null && name) moduleNames.set(id, name);
          }
        }
        if (pass !== 2) continue;

        try {
          if (ins.table === "pmc_user") {
            const rows = ins.rows.map((r) => {
              const id = toNum(r[idx.id ?? -1] ?? null);
              const username = r[idx.username ?? -1] ?? null;
              const idnumber = r[idx.idnumber ?? -1] ?? null;
              return {
                moodle_id: id,
                username, idnumber,
                email: r[idx.email ?? -1] ?? null,
                firstname: r[idx.firstname ?? -1] ?? null,
                lastname: r[idx.lastname ?? -1] ?? null,
                cpf: pickCpf(idnumber, username),
                lastaccess: toIso(r[idx.lastaccess ?? -1] ?? null),
              };
            }).filter((r) => r.moodle_id != null && r.moodle_id > 2); // ignora admin/guest
            for (let k = 0; k < rows.length; k += 500) {
              const slice = rows.slice(k, k + 500);
              const { error } = await admin.from("ava_users").upsert(slice, { onConflict: "moodle_id" });
              if (!error) resumo.users += slice.length;
            }
          } else if (ins.table === "pmc_course") {
            const rows = ins.rows.map((r) => ({
              moodle_id: toNum(r[idx.id ?? -1] ?? null),
              shortname: r[idx.shortname ?? -1] ?? null,
              fullname: r[idx.fullname ?? -1] ?? null,
              category: toNum(r[idx.category ?? -1] ?? null),
              startdate: toIso(r[idx.startdate ?? -1] ?? null),
              enddate: toIso(r[idx.enddate ?? -1] ?? null),
            })).filter((r) => r.moodle_id != null && r.moodle_id > 1);
            for (let k = 0; k < rows.length; k += 500) {
              const slice = rows.slice(k, k + 500);
              const { error } = await admin.from("ava_courses").upsert(slice, { onConflict: "moodle_id" });
              if (!error) resumo.courses += slice.length;
            }
          } else if (ins.table === "pmc_user_enrolments") {
            const rows = ins.rows.map((r) => {
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
            }).filter((r) => r.ava_user_id != null && r.ava_course_id != null);
            for (let k = 0; k < rows.length; k += 500) {
              const slice = rows.slice(k, k + 500);
              const { error } = await admin.from("ava_enrolments").upsert(slice, { onConflict: "moodle_id" });
              if (!error) resumo.enrolments += slice.length;
            }
          } else if (ins.table === "pmc_course_modules") {
            const rows = ins.rows.map((r) => {
              const moduleid = toNum(r[idx.module ?? -1] ?? null);
              return {
                moodle_cmid: toNum(r[idx.id ?? -1] ?? null),
                ava_course_id: toNum(r[idx.course ?? -1] ?? null),
                modulename: moduleid != null ? moduleNames.get(moduleid) ?? null : null,
                instance_id: toNum(r[idx.instance ?? -1] ?? null),
                nome: null,
                completion_enabled: toBool(r[idx.completion ?? -1] ?? null),
              };
            }).filter((r) => r.moodle_cmid != null);
            for (let k = 0; k < rows.length; k += 500) {
              const slice = rows.slice(k, k + 500);
              const { error } = await admin.from("ava_activities").upsert(slice, { onConflict: "moodle_cmid" });
              if (!error) resumo.activities += slice.length;
            }
          } else if (ins.table === "pmc_course_modules_completion") {
            const rows = ins.rows.map((r) => ({
              ava_user_id: toNum(r[idx.userid ?? -1] ?? null),
              ava_activity_id: toNum(r[idx.coursemoduleid ?? -1] ?? null),
              completionstate: toNum(r[idx.completionstate ?? -1] ?? null),
              timemodified: toIso(r[idx.timemodified ?? -1] ?? null),
            })).filter((r) => r.ava_user_id != null && r.ava_activity_id != null);
            for (let k = 0; k < rows.length; k += 500) {
              const slice = rows.slice(k, k + 500);
              const { error } = await admin.from("ava_completions").upsert(slice, { onConflict: "ava_user_id,ava_activity_id" });
              if (!error) resumo.completions += slice.length;
            }
          } else if (ins.table === "pmc_grade_items") {
            // Guardado indiretamente via grade_grades (itemname/type já vem daqui — mas não persistimos separado).
            // Grava em cache local para grades:
            for (const r of ins.rows) {
              const gid = toNum(r[idx.id ?? -1] ?? null);
              const cid = toNum(r[idx.courseid ?? -1] ?? null);
              if (gid != null) gradeItems.set(gid, {
                courseid: cid,
                itemname: r[idx.itemname ?? -1] ?? null,
                itemtype: r[idx.itemtype ?? -1] ?? null,
                grademax: toNum(r[idx.grademax ?? -1] ?? null),
              });
            }
          } else if (ins.table === "pmc_grade_grades") {
            const rows = ins.rows.map((r) => {
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
            }).filter((r) => r.ava_user_id != null && r.grade_item_id != null);
            for (let k = 0; k < rows.length; k += 500) {
              const slice = rows.slice(k, k + 500);
              const { error } = await admin.from("ava_grades").upsert(slice, { onConflict: "ava_user_id,grade_item_id" });
              if (!error) resumo.grades += slice.length;
            }
          }
        } catch {
          // não interrompe outras tabelas
        }
      }
      // limpa referência de grade_items só depois da 2ª passada
    }

    // Cruzamento pós-import
    // ava_users.beneficiaria_id ← beneficiarias.cpf
    const { data: benef } = await admin.from("beneficiarias").select("id, cpf").not("cpf", "is", null);
    if (benef) {
      const mapa = new Map<string, string>();
      for (const b of benef as { id: string; cpf: string }[]) mapa.set(b.cpf, b.id);
      // Busca ava_users com cpf sem vínculo
      const { data: users } = await admin
        .from("ava_users")
        .select("moodle_id, cpf")
        .not("cpf", "is", null)
        .is("beneficiaria_id", null);
      const updates: { moodle_id: number; beneficiaria_id: string }[] = [];
      for (const u of (users ?? []) as { moodle_id: number; cpf: string }[]) {
        const bid = mapa.get(u.cpf);
        if (bid) updates.push({ moodle_id: u.moodle_id, beneficiaria_id: bid });
      }
      for (let k = 0; k < updates.length; k += 500) {
        const slice = updates.slice(k, k + 500);
        for (const up of slice) {
          await admin.from("ava_users").update({ beneficiaria_id: up.beneficiaria_id }).eq("moodle_id", up.moodle_id);
        }
        resumo.matched_users += slice.length;
      }
    }

    // ava_courses.turma_id ← turmas.codigo_turma pelo shortname
    const { data: turmas } = await admin.from("turmas").select("id, codigo_turma").not("codigo_turma", "is", null);
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
            if (key.includes(k) || k.includes(key)) { tid = v; break; }
          }
        }
        if (tid) {
          await admin.from("ava_courses").update({ turma_id: tid }).eq("moodle_id", c.moodle_id);
          resumo.matched_courses += 1;
        }
      }
    }

    await admin
      .from("ava_importacoes")
      .update({ status: "concluido", terminado_em: new Date().toISOString(), resumo })
      .eq("id", importacaoId);

    return { importacao_id: importacaoId, resumo };
  });

// Cache de grade_items compartilhado entre chamadas do handler (só existe durante a execução).
const gradeItems: Map<number, { courseid: number | null; itemname: string | null; itemtype: string | null; grademax: number | null }> = new Map();