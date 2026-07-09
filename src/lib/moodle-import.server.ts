// Helpers server-only para parse do dump SQL do Moodle.
// Ficam fora de .functions.ts porque o splitter do TanStack apaga
// helpers module-scope referenciados por handlers de createServerFn.

export const TABELAS_ALVO = new Set<string>([
  "pmc_user",
  "pmc_course",
  "pmc_user_enrolments",
  "pmc_enrol",
  "pmc_course_modules",
  "pmc_modules",
  "pmc_course_modules_completion",
  "pmc_grade_items",
  "pmc_grade_grades",
  "pmc_role_assignments",
  "pmc_role",
  "pmc_context",
]);

export type ParsedInsert = {
  table: string;
  columns: string[];
  rows: (string | null)[][];
};

export function splitTuple(inner: string): (string | null)[] {
  const out: (string | null)[] = [];
  let i = 0;
  const n = inner.length;
  while (i < n) {
    while (i < n && (inner[i] === " " || inner[i] === "\t" || inner[i] === ",")) i += 1;
    if (i >= n) break;
    if (inner[i] === "'") {
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
          if (i + 1 < n && inner[i + 1] === "'") { s += "'"; i += 2; }
          else { i += 1; break; }
        } else {
          s += c;
          i += 1;
        }
      }
      out.push(s);
    } else {
      let s = "";
      while (i < n && inner[i] !== ",") { s += inner[i]; i += 1; }
      const t = s.trim();
      if (t.toUpperCase() === "NULL" || t === "") out.push(null);
      else out.push(t);
    }
  }
  return out;
}

export function splitValueRows(values: string): string[] {
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

export function parseInserts(chunk: string): ParsedInsert[] {
  const out: ParsedInsert[] = [];
  const re = /INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chunk))) {
    const table = match[1];
    if (!TABELAS_ALVO.has(table)) continue;
    const cols = match[2].split(",").map((c) => c.trim().replace(/^`|`$/g, ""));
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

export function toIso(v: string | null): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toBool(v: string | null): boolean | null {
  if (v == null) return null;
  return v === "1" || v.toLowerCase() === "true";
}

export function pickCpf(idnumber: string | null, username: string | null): string | null {
  for (const cand of [idnumber, username]) {
    if (!cand) continue;
    const digits = cand.replace(/\D+/g, "");
    if (digits.length === 11) return digits;
  }
  return null;
}

export function colIdx(cols: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (let i = 0; i < cols.length; i += 1) m[cols[i]] = i;
  return m;
}