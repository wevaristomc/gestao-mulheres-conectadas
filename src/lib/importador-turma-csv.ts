// Parser de CSV "Contas Bancárias das Alunas" — uma turma por arquivo.
// Extrai código da turma, turno, município (via prefixo), lista de alunas
// (nome, cpf, banco, agência, conta, assinou_lista, observação).

import { isValidCpf, onlyDigits } from "@/lib/cpf";

export type AlunaExtraida = {
  nome: string;
  cpf: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  assinou_lista: boolean;
  observacao_importacao: string | null;
};

export type TurmaExtraida = {
  codigo_turma: string | null;
  turno: "Manhã" | "Tarde" | "Noite" | null;
  municipio: string | null;
};

export type ResultadoImportacaoCsv = {
  arquivo: string;
  turma: TurmaExtraida;
  alunas: AlunaExtraida[];
  erros: string[];
};

// CSV parser — aceita separador , e ;
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === "," || c === ";") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

const RE_CODIGO = /([A-Z]{2,4})-([A-Z]{1,4})-(\d{1,3})/i;
const RE_TURNO = /(manh[ãa]|tarde|noite)/i;

function normalizarTurno(s: string | null): TurmaExtraida["turno"] {
  if (!s) return null;
  const m = s.match(RE_TURNO);
  if (!m) return null;
  const t = m[1].toLowerCase();
  if (t.startsWith("manh")) return "Manhã";
  if (t === "tarde") return "Tarde";
  if (t === "noite") return "Noite";
  return null;
}

function municipioPorPrefixo(codigo: string | null): string | null {
  if (!codigo) return null;
  const p = codigo.split("-")[0]?.toUpperCase();
  if (p === "JBT") return "Juatuba";
  if (p === "BET") return "Betim";
  return "Belo Horizonte";
}

function extrairTurmaDeTexto(texto: string): TurmaExtraida {
  const codMatch = texto.match(RE_CODIGO);
  const codigo = codMatch ? codMatch[0].toUpperCase().replace(/\s+/g, "") : null;
  const turno = normalizarTurno(texto);
  return { codigo_turma: codigo, turno, municipio: municipioPorPrefixo(codigo) };
}

function acharCabecalho(table: string[][]): number {
  for (let i = 0; i < Math.min(table.length, 5); i += 1) {
    const row = table[i].map((c) => c.trim().toLowerCase());
    const temNome = row.some((c) => c === "nome" || c.startsWith("nome "));
    const temCpf = row.some((c) => c === "cpf");
    if (temNome && temCpf) return i;
  }
  return -1;
}

function findIdx(header: string[], names: string[]): number {
  for (const n of names) {
    const i = header.findIndex((h) => h === n || h.startsWith(n + " ") || h.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Detecta em qualquer coluna a marcação "assinou / não assinou". */
function detectarAssinatura(row: string[]): { assinou: boolean; obs: string | null } {
  for (const cell of row) {
    const s = (cell ?? "").trim().toLowerCase();
    if (!s) continue;
    if (s.includes("n\u00e3o assinou") || s.includes("nao assinou") || s === "não assinou" || s === "nao assinou") {
      return { assinou: false, obs: "não assinou" };
    }
  }
  for (const cell of row) {
    const s = (cell ?? "").trim().toLowerCase();
    if (s === "assinou" || s === "assinou a lista" || s === "sim" || s === "ok") {
      return { assinou: true, obs: null };
    }
  }
  return { assinou: true, obs: null }; // default: sem marcação, considera assinado
}

function detectarObsGeral(row: string[]): string | null {
  for (const cell of row) {
    const s = (cell ?? "").trim().toLowerCase();
    if (
      s.includes("n\u00e3o tem dados") ||
      s.includes("nao tem dados") ||
      s.includes("n\u00e3o atendeu contato") ||
      s.includes("nao atendeu contato") ||
      s.includes("n\u00e3o est\u00e1 no curso")
    ) {
      return cell.trim();
    }
  }
  return null;
}

export function parseCsvTurma(filename: string, text: string): ResultadoImportacaoCsv {
  const nomeSemExt = filename.replace(/\.csv$/i, "").replace(/_/g, " ");
  const erros: string[] = [];
  const table = parseCsv(text).filter((r) => r.some((v) => v && v.trim().length > 0));
  if (!table.length) {
    return { arquivo: filename, turma: extrairTurmaDeTexto(nomeSemExt), alunas: [], erros: ["CSV vazio"] };
  }

  // Turma: tenta na 1ª linha, senão no nome do arquivo
  const primeiraLinha = (table[0] ?? []).join(" ");
  const turmaPrimeira = extrairTurmaDeTexto(primeiraLinha);
  const turmaNome = extrairTurmaDeTexto(nomeSemExt);
  const turma: TurmaExtraida = {
    codigo_turma: turmaPrimeira.codigo_turma ?? turmaNome.codigo_turma,
    turno: turmaPrimeira.turno ?? turmaNome.turno,
    municipio: municipioPorPrefixo(turmaPrimeira.codigo_turma ?? turmaNome.codigo_turma),
  };
  if (!turma.codigo_turma) erros.push("Código da turma não identificado no CSV nem no nome do arquivo.");

  const idxHeader = acharCabecalho(table);
  if (idxHeader < 0) {
    return { arquivo: filename, turma, alunas: [], erros: [...erros, "Cabeçalho (Nome, CPF, …) não encontrado."] };
  }

  const header = table[idxHeader].map((h) => h.trim().toLowerCase());
  const idxNome = findIdx(header, ["nome aluna", "nome"]);
  const idxCpf = findIdx(header, ["cpf"]);
  const idxBanco = findIdx(header, ["banco"]);
  const idxAgencia = findIdx(header, ["agência", "agencia"]);
  const idxConta = findIdx(header, ["conta"]);

  if (idxNome < 0 || idxCpf < 0) {
    return { arquivo: filename, turma, alunas: [], erros: [...erros, "Colunas Nome ou CPF ausentes."] };
  }

  const alunas: AlunaExtraida[] = [];
  for (let i = idxHeader + 1; i < table.length; i += 1) {
    const row = table[i];
    const nome = (row[idxNome] ?? "").trim();
    const cpfRaw = row[idxCpf] ?? "";
    if (!nome) continue;
    const cpf = onlyDigits(cpfRaw);
    if (cpf.length !== 11 || !isValidCpf(cpf)) {
      erros.push(`Linha ${i + 1}: CPF inválido para "${nome}" (${cpfRaw})`);
      continue;
    }
    const bancoBruto = idxBanco >= 0 ? (row[idxBanco] ?? "").trim() : "";
    const semDados =
      /n[ãa]o tem dados/i.test(bancoBruto) ||
      /n[ãa]o atendeu/i.test(bancoBruto);
    const banco = semDados ? null : (bancoBruto || null);
    const agencia = idxAgencia >= 0 ? ((row[idxAgencia] ?? "").trim() || null) : null;
    const conta = idxConta >= 0 ? ((row[idxConta] ?? "").trim() || null) : null;
    const { assinou, obs } = detectarAssinatura(row);
    const obsGeral = detectarObsGeral(row);
    const observacao = [semDados ? bancoBruto : null, obsGeral, obs]
      .filter((s): s is string => !!s)
      .join(" · ") || null;
    alunas.push({
      nome,
      cpf,
      banco,
      agencia,
      conta,
      assinou_lista: assinou,
      observacao_importacao: observacao,
    });
  }

  return { arquivo: filename, turma, alunas, erros };
}