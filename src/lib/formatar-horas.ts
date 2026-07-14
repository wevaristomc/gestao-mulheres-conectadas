// Formatação única de horas. Elimina duplicações "240h horas" ou
// "${x} minutos horas" espalhadas pelo código (auditoria P12).
//
// Uso:
//   formatarHoras(150)              // "150h"
//   formatarHoras(150, "h")         // "150h"
//   formatarHoras(90, "min")        // "01:30"
//   formatarHoras(2.5, "h", "hh:mm")// "02:30"
//   formatarHoras(150, "h", "extenso") // "150 horas"

export type UnidadeHora = "h" | "min";
export type FormatoHora = "curto" | "hh:mm" | "extenso";

function partesHM(horasDecimais: number): { h: number; m: number } {
  const total = Math.max(0, Number(horasDecimais) || 0);
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  // Ajusta caso o arredondamento estoure 60 minutos.
  if (m === 60) return { h: h + 1, m: 0 };
  return { h, m };
}

export function formatarHoras(
  valor: number | string | null | undefined,
  unidade: UnidadeHora = "h",
  formato: FormatoHora = "curto",
): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return "—";
  const horas = unidade === "min" ? n / 60 : n;
  const { h, m } = partesHM(horas);
  if (formato === "hh:mm") {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  if (formato === "extenso") {
    if (m === 0) return `${h} hora${h === 1 ? "" : "s"}`;
    return `${h}h${String(m).padStart(2, "0")}`;
  }
  // curto: "150h" ou "01:30" se tiver minutos
  if (m === 0) return `${h}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}