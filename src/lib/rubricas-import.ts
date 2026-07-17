export type RubricaImportada = {
  linha: number;
  codigo: string;
  descricao: string | null;
  valorPrevisto: number;
};

export type ResultadoImportacaoRubricas = {
  rubricas: RubricaImportada[];
  avisos: string[];
  aba: string;
};

function normalizarCabecalho(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizarCodigoRubrica(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function lerValorMonetario(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const original = String(value ?? "").trim();
  if (!original) return null;

  const negativeByParentheses = /^\(.*\)$/.test(original);
  let cleaned = original
    .replace(/R\$/gi, "")
    .replace(/[\s\u00a0]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = cleaned.match(/\./g)?.length ?? 0;
    if (dots > 1 || (dots === 1 && /\.\d{3}$/.test(cleaned))) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
}

const CODIGO_HEADERS = new Set([
  "codigo",
  "cod",
  "item",
  "codigoitem",
  "codigorubrica",
  "codigodarubrica",
  "rubrica",
]);
const VALOR_HEADERS = new Set([
  "valorprevisto",
  "previsto",
  "valoraprovado",
  "valororcado",
  "valororcamento",
  "valortotal",
  "valordarubrica",
  "total",
  "valor",
]);
const DESCRICAO_HEADERS = new Set([
  "descricao",
  "descricaorubrica",
  "descricaodarubrica",
  "nome",
  "objeto",
]);

function indiceDe(headers: unknown[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(normalizarCabecalho(header)));
}

export async function lerPlanilhaRubricas(file: File): Promise<ResultadoImportacaoRubricas> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  if (!workbook.SheetNames.length) throw new Error("A planilha não possui nenhuma aba.");

  let selecionada: {
    aba: string;
    rows: unknown[][];
    headerIndex: number;
    codigoIndex: number;
    valorIndex: number;
    descricaoIndex: number;
  } | null = null;

  for (const aba of workbook.SheetNames) {
    const sheet = workbook.Sheets[aba];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: true,
    });
    for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
      const row = rows[index] ?? [];
      const codigoIndex = indiceDe(row, CODIGO_HEADERS);
      const valorIndex = indiceDe(row, VALOR_HEADERS);
      if (codigoIndex >= 0 && valorIndex >= 0 && codigoIndex !== valorIndex) {
        selecionada = {
          aba,
          rows,
          headerIndex: index,
          codigoIndex,
          valorIndex,
          descricaoIndex: indiceDe(row, DESCRICAO_HEADERS),
        };
        break;
      }
    }
    if (selecionada) break;
  }

  if (!selecionada) {
    throw new Error(
      "Não encontrei as colunas Código/Rubrica e Valor previsto/aprovado nas primeiras 20 linhas das abas.",
    );
  }
  const { aba, rows, headerIndex, codigoIndex, valorIndex, descricaoIndex } = selecionada;

  const rubricas: RubricaImportada[] = [];
  const avisos: string[] = [];
  const codigosVistos = new Set<string>();
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const codigo = String(row[codigoIndex] ?? "").trim();
    const rawValor = row[valorIndex];
    if (!codigo && String(rawValor ?? "").trim() === "") continue;
    if (!codigo) {
      avisos.push(`Linha ${index + 1}: código da rubrica não informado.`);
      continue;
    }

    const valorPrevisto = lerValorMonetario(rawValor);
    if (valorPrevisto == null || valorPrevisto < 0) {
      avisos.push(`Linha ${index + 1}: valor previsto inválido para a rubrica ${codigo}.`);
      continue;
    }

    const codigoNormalizado = normalizarCodigoRubrica(codigo);
    if (codigosVistos.has(codigoNormalizado)) {
      avisos.push(`Linha ${index + 1}: rubrica ${codigo} repetida na planilha.`);
      continue;
    }
    codigosVistos.add(codigoNormalizado);
    rubricas.push({
      linha: index + 1,
      codigo,
      descricao:
        descricaoIndex >= 0 && String(row[descricaoIndex] ?? "").trim()
          ? String(row[descricaoIndex]).trim()
          : null,
      valorPrevisto,
    });
  }

  if (rubricas.length === 0) {
    throw new Error("Nenhuma rubrica válida foi encontrada na planilha.");
  }
  return { rubricas, avisos, aba };
}
