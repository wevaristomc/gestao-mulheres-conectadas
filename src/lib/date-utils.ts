// Utilitários de data tz-safe.
// Regra: campos date-only (YYYY-MM-DD) NUNCA devem passar por new Date(iso)
// direto — o JS parseia como UTC midnight e desloca D-1 em fusos negativos.
// Sempre use parseISODateLocal / formatarDataBR abaixo.

export function parseISODateLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(y, mo - 1, da);
  // Valida dia impossível (ex.: 31/02).
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d;
}

export function formatarDataBR(iso: string | null | undefined): string {
  const d = parseISODateLocal(iso);
  if (!d) return "";
  return d.toLocaleDateString("pt-BR");
}

export function formatarDataExtenso(iso: string | null | undefined): string {
  const d = parseISODateLocal(iso);
  if (!d) return "";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

// Percentual seguro (evita divisão por zero e NaN).
export function pctSeguro(numerador: number | null | undefined, denominador: number | null | undefined): number {
  const n = Number(numerador ?? 0);
  const d = Number(denominador ?? 0);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return (n / d) * 100;
}

// Coerção segura para texto em PDFs / células / templates.
// jsPDF renderiza literalmente "undefined"/"null" se o valor não for string;
// txt() garante fallback vazio (ou o placeholder passado) sem quebrar layout.
export function txt(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : fallback;
  const s = String(v);
  if (s === "undefined" || s === "null" || s === "NaN") return fallback;
  return s;
}