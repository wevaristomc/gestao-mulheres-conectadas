// Cede o event loop para o navegador respirar durante loops pesados
// (geração de PDF/XLSX com 100+ linhas). Auditoria P3.
// Uso:
//   for (let i = 0; i < linhas.length; i += 1) {
//     desenhar(linhas[i]);
//     if (i % 100 === 99) await yieldToUI();
//   }

export function yieldToUI(): Promise<void> {
  // requestAnimationFrame quando disponível (garante paint); fallback setTimeout.
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Ajuda a chunkar operações: `await forEachChunked(rows, 100, async (r) => …)`.
export async function forEachChunked<T>(
  rows: T[],
  chunk: number,
  fn: (row: T, index: number) => void | Promise<void>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += 1) {
    await fn(rows[i], i);
    if (i > 0 && i % chunk === 0) await yieldToUI();
  }
}