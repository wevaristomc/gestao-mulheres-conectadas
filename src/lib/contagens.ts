// Fonte única para contagens de cursistas/matrículas.
// Regra oficial (auditoria P4):
//   • cursistas ativas  = matrículas cujo status NÃO está em {evadida, desistente, cancelada}
//   • concluintes       = status = 'concluinte'
//   • evadidas          = status ∈ {evadida, desistente}
// Todo dashboard, relatório DEQ e ferramenta do Orbe DEVE reutilizar estes
// helpers — se um número não bater entre telas, o culpado é NÃO usar este arquivo.

export const STATUS_INATIVOS = ["evadida", "desistente", "cancelada"] as const;
export const STATUS_EVADIDOS = ["evadida", "desistente"] as const;
export const STATUS_CONCLUINTE = "concluinte";

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

export function isMatriculaAtiva(m: { status?: unknown } | Record<string, unknown>): boolean {
  const s = norm((m as Record<string, unknown>).status);
  return !STATUS_INATIVOS.includes(s as (typeof STATUS_INATIVOS)[number]);
}

export function isMatriculaConcluinte(m: { status?: unknown } | Record<string, unknown>): boolean {
  return norm((m as Record<string, unknown>).status) === STATUS_CONCLUINTE;
}

export function isMatriculaEvadida(m: { status?: unknown } | Record<string, unknown>): boolean {
  const s = norm((m as Record<string, unknown>).status);
  return STATUS_EVADIDOS.includes(s as (typeof STATUS_EVADIDOS)[number]);
}

// O enum do banco não possui o valor legado "cancelada". O filtro remoto usa
// somente valores válidos; o helper local ainda tolera dados antigos em texto.
export const FILTRO_STATUS_INATIVOS = `(${STATUS_EVADIDOS.join(",")})`;

export function contarAtivas<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
): number {
  return (rows ?? []).filter(isMatriculaAtiva).length;
}
export function contarConcluintes<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
): number {
  return (rows ?? []).filter(isMatriculaConcluinte).length;
}
export function contarEvadidas<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
): number {
  return (rows ?? []).filter(isMatriculaEvadida).length;
}
