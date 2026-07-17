export type LancamentoExtrato = {
  linha: number;
  data: string;
  valor: number;
  tipo: "credito" | "debito";
  contraparte: string;
  descricao: string;
  documento: string;
  dadosOriginais: Record<string, string>;
};

export type ResultadoExtrato = {
  lancamentos: LancamentoExtrato[];
  colunas: string[];
  delimitador: string;
  ignoradas: Array<{ linha: number; motivo: string }>;
};

function semAcentos(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizarNome(value: string) {
  return semAcentos(value)
    .replace(/\b(da|de|do|das|dos|e)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLinhaCSV(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function linhasCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        current += '""';
        i += 1;
      } else {
        quoted = !quoted;
        current += char;
      }
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      if (current.trim()) rows.push(parseLinhaCSV(current, delimiter));
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) rows.push(parseLinhaCSV(current, delimiter));
  return rows;
}

function detectarDelimitador(text: string) {
  const sample = text.split(/\r?\n/).filter(Boolean).slice(0, 5).join("\n");
  const candidates = [";", ",", "\t"];
  return (
    candidates
      .map((delimiter) => ({ delimiter, count: linhasCSV(sample, delimiter)[0]?.length ?? 0 }))
      .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ";"
  );
}

function encontrarColuna(headers: string[], nomes: string[]) {
  const normalized = headers.map(semAcentos);
  for (const nome of nomes) {
    const exact = normalized.indexOf(nome);
    if (exact >= 0) return exact;
  }
  for (const nome of nomes) {
    const partial = normalized.findIndex((header) => header.includes(nome));
    if (partial >= 0) return partial;
  }
  return -1;
}

function parseValor(value: string): number | null {
  const clean = value
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/[^0-9,.-]/g, "");
  if (!clean) return null;
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let normalized = clean;
  if (lastComma > lastDot) normalized = clean.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) normalized = clean.replace(/,/g, "");
  else if (lastComma >= 0) normalized = clean.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseData(value: string): string | null {
  const clean = value.trim();
  let match = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function valorCelula(row: string[], index: number) {
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

export function parseExtratoCSV(text: string): ResultadoExtrato {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const delimitador = detectarDelimitador(cleaned);
  const rows = linhasCSV(cleaned, delimitador);
  if (rows.length < 2) throw new Error("O CSV não contém lançamentos.");

  const colunas = rows[0].map((header, index) => header.trim() || `Coluna ${index + 1}`);
  const dataIndex = encontrarColuna(colunas, [
    "data",
    "data lancamento",
    "data do lancamento",
    "dt lancamento",
  ]);
  const valorIndex = encontrarColuna(colunas, [
    "valor",
    "valor lancamento",
    "valor do lancamento",
    "amount",
  ]);
  const creditoIndex = encontrarColuna(colunas, ["credito", "valor credito"]);
  const debitoIndex = encontrarColuna(colunas, ["debito", "valor debito"]);
  const tipoIndex = encontrarColuna(colunas, ["tipo", "natureza", "credito debito", "c d"]);
  const nomeIndex = encontrarColuna(colunas, [
    "nome beneficiario",
    "beneficiario",
    "favorecido",
    "nome favorecido",
    "contraparte",
    "nome pagador",
    "pagador",
    "nome",
    "destinatario",
    "remetente",
  ]);
  const descricaoIndex = encontrarColuna(colunas, [
    "historico",
    "descricao",
    "detalhe",
    "lancamento",
    "memo",
  ]);
  const documentoIndex = encontrarColuna(colunas, [
    "documento",
    "numero documento",
    "id transacao",
    "identificador",
    "lote",
  ]);

  if (dataIndex < 0) throw new Error("Não encontrei uma coluna de data no CSV.");
  if (valorIndex < 0 && creditoIndex < 0 && debitoIndex < 0) {
    throw new Error("Não encontrei uma coluna de valor, crédito ou débito no CSV.");
  }

  const lancamentos: LancamentoExtrato[] = [];
  const ignoradas: Array<{ linha: number; motivo: string }> = [];
  rows.slice(1).forEach((row, offset) => {
    const linha = offset + 2;
    const data = parseData(valorCelula(row, dataIndex));
    const valorPrincipal = parseValor(valorCelula(row, valorIndex));
    const credito = parseValor(valorCelula(row, creditoIndex));
    const debito = parseValor(valorCelula(row, debitoIndex));
    const tipoTexto = semAcentos(valorCelula(row, tipoIndex));
    const rawValue =
      debito && debito !== 0
        ? -Math.abs(debito)
        : credito && credito !== 0
          ? Math.abs(credito)
          : valorPrincipal;
    if (!data) {
      ignoradas.push({ linha, motivo: "data inválida" });
      return;
    }
    if (rawValue === null || rawValue === 0) {
      ignoradas.push({ linha, motivo: "valor inválido ou zerado" });
      return;
    }
    const tipo =
      rawValue < 0 || /debito|saida|pagamento|d\b/.test(tipoTexto) ? "debito" : "credito";
    const dadosOriginais = Object.fromEntries(
      colunas.map((header, index) => [header, row[index] ?? ""]),
    );
    lancamentos.push({
      linha,
      data,
      valor: Math.abs(rawValue),
      tipo,
      contraparte: valorCelula(row, nomeIndex),
      descricao: valorCelula(row, descricaoIndex),
      documento: valorCelula(row, documentoIndex),
      dadosOriginais,
    });
  });

  if (!lancamentos.length) throw new Error("Nenhum lançamento válido foi encontrado no CSV.");
  return { lancamentos, colunas, delimitador, ignoradas };
}

export async function lerArquivoExtrato(file: File) {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacements = (text.match(/�/g) ?? []).length;
  if (replacements > 0) text = new TextDecoder("windows-1252").decode(buffer);
  return parseExtratoCSV(text);
}

export function pontuarCorrespondencia(
  lancamento: Pick<LancamentoExtrato, "valor" | "contraparte" | "descricao">,
  beneficio: { valor: number; nome: string },
) {
  const diferenca = Math.abs(lancamento.valor - beneficio.valor);
  const valorScore = diferenca <= 0.01 ? 55 : diferenca <= 1 ? 35 : 0;
  const origem = normalizarNome(`${lancamento.contraparte} ${lancamento.descricao}`);
  const destino = normalizarNome(beneficio.nome);
  if (!origem || !destino) return valorScore;
  const tokens = destino.split(" ").filter((token) => token.length >= 3);
  const matched = tokens.filter((token) => origem.includes(token)).length;
  const nomeScore = tokens.length ? Math.round((matched / tokens.length) * 45) : 0;
  return Math.min(100, valorScore + nomeScore);
}
