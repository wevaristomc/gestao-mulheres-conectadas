import type { DadosInscricaoDigital } from "@/lib/inscricao-digital";

export type FichaInscricaoPrint = {
  protocolo?: string;
  turmaNome: string;
  projetoNome?: string;
  dados: DadosInscricaoDigital;
};

const STORAGE_PREFIX = "ficha-inscricao-print:";

export function abrirFichaInscricaoParaImpressao(ficha: FichaInscricaoPrint): void {
  const chave = crypto.randomUUID();
  localStorage.setItem(`${STORAGE_PREFIX}${chave}`, JSON.stringify(ficha));
  window.open(`/imprimir-inscricao?chave=${encodeURIComponent(chave)}`, "_blank", "noopener");
}

export function lerFichaInscricaoParaImpressao(chave: string): FichaInscricaoPrint | null {
  const storageKey = `${STORAGE_PREFIX}${chave}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const ficha = JSON.parse(raw) as FichaInscricaoPrint;
    localStorage.removeItem(storageKey);
    return ficha;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}
