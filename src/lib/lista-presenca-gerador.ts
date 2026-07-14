import { jsPDF } from "jspdf";
import ExcelJS from "exceljs";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table,
  TableCell, TableRow, TextRun, WidthType, PageBreak,
} from "docx";
import {
  carregarLogosInstitucionais,
  renderCabecalhoInstitucional,
  type LinhaCabecalho,
  type LogoInstitucional,
} from "./cabecalho-institucional";
import { formatarCPF } from "@/lib/cpf";
import { parseISODateLocal, formatarDataBR as fmtDataBR, formatarDataExtenso } from "@/lib/date-utils";
import { yieldToUI } from "@/lib/async-yield";

export type Cursista = { nome: string; cpf: string | null };
export type AulaInfo = {
  data: string | null;
  tema: string | null;
  cargaHoraria: string | null;
  instrutor: string | null;
  horaInicio?: string | null;
  horaFim?: string | null;
};
export type TurmaInfo = {
  codigo: string | null;
  nomeCurso: string | null;
  municipio: string | null;
  turno: string | null;
  local: string | null;
  entidade?: string | null;
};
export type ListaData = {
  turma: TurmaInfo;
  aula: AulaInfo;
  cursistas: Cursista[];
  extras: number;
};

// Modelo oficial DEQ exige CPF digitalizado do/a cursista na lista de
// frequência (o documento é impresso e assinado; não há PII adicional
// Datas e CPF vêm de @/lib/date-utils e @/lib/cpf (fonte única — auditoria P1/P5).
function formatarDataBR(iso: string | null): string {
  if (!iso) return "___/___/______";
  return fmtDataBR(iso) || String(iso);
}
function dataPorExtenso(iso: string | null): string {
  if (!iso) return "_____________________________";
  return formatarDataExtenso(iso) || String(iso);
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keepParse = parseISODateLocal;

function ordenarCursistas(rows: Cursista[]): Cursista[] {
  return [...rows].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

// Ritmo de folhas replicando o documento oficial escaneado:
// - Primeira folha: cabeçalho institucional alto + cabeçalho de colunas +
//   22 linhas de cursistas.
// - Folhas de continuação: SEM cabeçalho institucional e SEM cabeçalho de
//   colunas — a tabela recomeça do topo da folha, com numeração contínua.
// - Última folha (que também é uma folha de continuação, exceto quando a
//   turma cabe toda na primeira): reserva espaço para o bloco de assinatura
//   do/a instrutor/a no rodapé, dentro de uma caixa.
// Recalculado para as novas medidas fixas:
// - Cabeçalho institucional: 290pt (marginTop 34 + 290 + 4 gap = 328)
// - Cabeçalho da tabela: 36pt → tabela começa em ~364
// - Rodapé de controle absoluto em H−10; área útil termina em H−28 = 814
// - Assinatura: caixa 42pt + 10pt gap = 52pt (só na última folha)
//   rowH ~20pt.
const LINHAS_PRIMEIRA_PAGINA = 20;
const LINHAS_CONTINUACAO = 38;
const LINHAS_ULTIMA = 35;

type FolhaLista = { linhas: Cursista[]; tipo: "primeira" | "continuacao" | "ultima" };

function paginarCursistas(cursistas: Cursista[], extras: number): FolhaLista[] {
  const rows: Cursista[] = [...cursistas];
  for (let i = 0; i < extras; i += 1) rows.push({ nome: "", cpf: null });
  const preenche = (arr: Cursista[], target: number) => {
    while (arr.length < target) arr.push({ nome: "", cpf: null });
    return arr;
  };
  // Caso 1: tudo cabe na primeira folha → única folha, tratada como última
  // (para desenhar a caixa de assinatura no rodapé).
  if (rows.length <= LINHAS_PRIMEIRA_PAGINA) {
    return [{ linhas: preenche(rows.slice(0, LINHAS_PRIMEIRA_PAGINA), LINHAS_PRIMEIRA_PAGINA), tipo: "primeira" }];
  }
  const folhas: FolhaLista[] = [];
  folhas.push({ linhas: preenche(rows.slice(0, LINHAS_PRIMEIRA_PAGINA), LINHAS_PRIMEIRA_PAGINA), tipo: "primeira" });
  let i = LINHAS_PRIMEIRA_PAGINA;
  while (rows.length - i > LINHAS_ULTIMA) {
    const slice = rows.slice(i, i + LINHAS_CONTINUACAO);
    preenche(slice, LINHAS_CONTINUACAO);
    folhas.push({ linhas: slice, tipo: "continuacao" });
    i += LINHAS_CONTINUACAO;
  }
  const ultima = rows.slice(i);
  preenche(ultima, LINHAS_ULTIMA);
  folhas.push({ linhas: ultima, tipo: "ultima" });
  return folhas;
}

/**
 * Calcula a carga horária de uma aula no formato "NN horas".
 * 1) Se houver hora início e fim válidas → (fim − início) em horas.
 * 2) Caso contrário, parseia `cargaHoraria`. Se o número > 12 assume minutos
 *    e divide por 60. Sempre com 2 dígitos.
 */
function formatarCargaHorariaAula(aula: AulaInfo): string | null {
  const parseHM = (s: string | null | undefined): number | null => {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const ini = parseHM(aula.horaInicio);
  const fim = parseHM(aula.horaFim);
  if (ini !== null && fim !== null && fim > ini) {
    const horas = (fim - ini) / 60;
    const inteiro = Number.isInteger(horas) ? String(Math.round(horas)).padStart(2, "0") : horas.toFixed(1);
    return `${inteiro} horas`;
  }
  if (aula.cargaHoraria) {
    const num = Number(String(aula.cargaHoraria).replace(/[^\d.,]/g, "").replace(",", "."));
    if (Number.isFinite(num) && num > 0) {
      const horas = num > 12 ? num / 60 : num;
      const inteiro = Number.isInteger(horas) ? String(Math.round(horas)).padStart(2, "0") : horas.toFixed(1);
      return `${inteiro} horas`;
    }
  }
  return null;
}

// -------------------------------- PDF --------------------------------

export async function gerarListaPDF(listas: ListaData[]): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const logos = await carregarLogosInstitucionais();

  const paginasPorLista = listas.map((l) => paginarCursistas(ordenarCursistas(l.cursistas), l.extras));
  const totalPag = paginasPorLista.reduce((a, p) => a + p.length, 0);
  let pageNo = 0;
  // P3 — em jobs grandes cede o event loop a cada folha renderizada.
  for (let i = 0; i < listas.length; i += 1) {
    const lista = listas[i];
    const paginas = paginasPorLista[i];
    for (let pi = 0; pi < paginas.length; pi += 1) {
      const folha = paginas[pi];
      pageNo += 1;
      if (pageNo > 1) doc.addPage();
      // A primeira folha (única ou não) é também a última quando há só uma.
      const ehUltima = pi === paginas.length - 1;
      if (folha.tipo === "primeira") {
        renderPrimeiraPaginaPDF(doc, lista, folha.linhas, W, H, pageNo, totalPag, pi + 1, paginas.length, logos, ehUltima);
      } else {
        renderContinuacaoPDF(doc, lista, folha.linhas, W, H, pageNo, totalPag, pi + 1, paginas.length, folha.tipo === "ultima");
      }
      if (totalPag > 4 && pageNo % 4 === 0) await yieldToUI();
    }
  }

  return doc.output("blob");
}

// Larguras de coluna da tabela (fração da largura útil), compartilhadas
// entre a primeira folha e as folhas de continuação para manter alinhamento
// visual perfeito entre páginas.
const COL_FRAC = {
  no: 0.06,
  nome: 0.34,
  cpf: 0.14,
  freq: 0.14,
  lanche: 0.14,
  // assinatura: restante (0.18)
} as const;

function calcularXs(marginX: number, tableW: number): number[] {
  const wNo = tableW * COL_FRAC.no;
  const wNome = tableW * COL_FRAC.nome;
  const wCPF = tableW * COL_FRAC.cpf;
  const wFreq = tableW * COL_FRAC.freq;
  const wLanche = tableW * COL_FRAC.lanche;
  return [
    marginX,
    marginX + wNo,
    marginX + wNo + wNome,
    marginX + wNo + wNome + wCPF,
    marginX + wNo + wNome + wCPF + wFreq,
    marginX + wNo + wNome + wCPF + wFreq + wLanche,
    marginX + tableW,
  ];
}

// Rodapé de controle interno (cinza), impresso em todas as folhas.
function rodapeControle(doc: jsPDF, W: number, H: number, marginX: number, dataAula: string | null, pageNo: number, totalDocPag: number, paginaLista: number, totalPaginasLista: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(170, 170, 170);
  doc.text(
    `Data de referência ${dataPorExtenso(dataAula)} — Página ${pageNo}/${totalDocPag}` +
      (totalPaginasLista > 1 ? ` — folha ${paginaLista}/${totalPaginasLista}` : ""),
    W - marginX, H - 10, { align: "right" },
  );
}

// Caixa de assinatura do/a instrutor/a — só na última folha.
function caixaAssinaturaInstrutor(doc: jsPDF, W: number, marginX: number, y: number): number {
  const w = W - marginX * 2;
  const h = 42;
  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.rect(marginX, y, w, h);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("ASSINATURA DO/A INSTRUTOR/A:", marginX + 8, y + h / 2 + 3);
  const labW = doc.getTextWidth("ASSINATURA DO/A INSTRUTOR/A:");
  doc.setLineWidth(0.4);
  doc.line(marginX + 8 + labW + 8, y + h / 2 + 5, marginX + w - 8, y + h / 2 + 5);
  return y + h;
}

function renderPrimeiraPaginaPDF(
  doc: jsPDF,
  lista: ListaData,
  linhas: Cursista[],
  W: number,
  H: number,
  pageNo: number,
  totalDocPag: number,
  paginaLista: number,
  totalPaginasLista: number,
  logos: (LogoInstitucional | null)[],
  ehUltima: boolean,
) {
  const marginX = 28;
  let y = 34;

  // ————— Cabeçalho institucional oficial (2 colunas: logos | campos) —————
  const entidade = (lista.turma.entidade ?? "QUINTA ARTE").toUpperCase();
  const local = lista.turma.local ?? "";
  const turno = lista.turma.turno ? ` ${lista.turma.turno.toUpperCase()}` : "";
  const identTurma = `${lista.turma.codigo ?? ""}${turno ? " -" + turno : ""}`.trim();
  const conteudo = lista.aula.tema ?? "";
  const instrutor = lista.aula.instrutor ?? "";
  const horaIni = lista.aula.horaInicio && lista.aula.horaInicio.trim() ? lista.aula.horaInicio : "___:___";
  const horaFim = lista.aula.horaFim && lista.aula.horaFim.trim() ? lista.aula.horaFim : "___:___";
  const chFmt = formatarCargaHorariaAula(lista.aula);
  const linhasCab: LinhaCabecalho[] = [
    { tipo: "titulo", texto: "LISTA DE FREQUÊNCIA DOS CURSISTAS AS AULAS TEÓRICAS E PRÁTICAS" },
    { tipo: "subtitulo", texto: "Programa Manuel Querino de Qualificação Social e Profissional-PMQ/DEQ/SEMP/MTE" },
    { tipo: "campo", label: "Nome da Entidade Executora:", valor: entidade },
    { tipo: "campo", label: "Local de Realização da Qualificação:", valor: local },
    { tipo: "campo", label: "Identificação da Turma:", valor: identTurma },
    { tipo: "campo", label: "Conteúdo das Aulas:", valor: conteudo },
    { tipo: "campo", label: "Instrutor/a:", valor: instrutor, sublinhar: Boolean(instrutor) },
    {
      tipo: "campo",
      label: "Horário de Início e Fim das Aulas:",
      valor: `${horaIni} às ${horaFim}`,
      sublinhar: Boolean(lista.aula.horaInicio && lista.aula.horaFim),
    },
    {
      tipo: "dois-campos",
      a: {
        label: "Carga Horária Total/Dia:",
        valor: chFmt ?? "____ horas",
        sublinhar: Boolean(chFmt),
      },
      b: { label: "Quantidade de Cursistas Presentes na Aula:", valor: "_____" },
    },
  ];
  y = renderCabecalhoInstitucional(doc, { W, marginX, yStart: y, linhas: linhasCab, logos });
  y += 4;

  // ————— Tabela de cursistas —————
  const tableX = marginX;
  const tableW = W - marginX * 2;
  const xs2 = calcularXs(marginX, tableW);
  const wNo2 = xs2[1] - xs2[0];
  const wNome2 = xs2[2] - xs2[1];
  const wCPF2 = xs2[3] - xs2[2];
  const headerH = 36;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(tableX, y, tableW, headerH);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  const dataLabel = formatarDataBR(lista.aula.data);
  const headers: string[] = [
    "Nº",
    "NOME COMPLETO DO/A CURSISTA (digitalizado)",
    "CPF (digitalizado)",
    `Data ${dataLabel} Frequência`,
    "ENTREGA DO LANCHE (QUANDO FOR DIÁRIO)",
    "ASSINATURA DO/A CURSISTA",
  ];
  headers.forEach((h, i) => {
    const colW = xs2[i + 1] - xs2[i];
    const cx = xs2[i] + colW / 2;
    const linhasTxt = doc.splitTextToSize(h, colW - 6) as string[];
    const lh = 8;
    const bloco = linhasTxt.length * lh;
    const startY = y + (headerH - bloco) / 2 + lh - 2;
    linhasTxt.forEach((p, j) => {
      doc.text(p, cx, startY + j * lh, { align: "center" });
    });
  });
  // grade do header
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  for (let i = 1; i < xs2.length - 1; i += 1) {
    doc.line(xs2[i], y, xs2[i], y + headerH);
  }
  y += headerH;

  // linhas
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  // Área útil: até H − 28 (28pt reservados para o rodapé de controle).
  const bottomLimite = H - 28;
  const reservaAssinatura = ehUltima ? 52 : 0;
  const disponivel = bottomLimite - y - reservaAssinatura;
  const linhaTabH = Math.floor(disponivel / linhas.length);
  const rowH = Math.max(16, Math.min(22, linhaTabH));
  const numeroInicial = 1;
  linhas.forEach((c, i) => {
    const rowY = y + i * rowH;
    doc.rect(tableX, rowY, tableW, rowH);
    for (let j = 1; j < xs2.length - 1; j += 1) {
      doc.line(xs2[j], rowY, xs2[j], rowY + rowH);
    }
    const numero = String(numeroInicial + i).padStart(2, "0");
    doc.text(numero, xs2[0] + wNo2 / 2, rowY + rowH / 2 + 3, { align: "center" });
    if (c.nome) {
      const maxNomeW = wNome2 - 8;
      const nome = doc.splitTextToSize(c.nome, maxNomeW)[0] as string;
      doc.text(nome, xs2[1] + 4, rowY + rowH / 2 + 3);
    }
    if (c.cpf) {
      doc.text(formatarCPF(c.cpf ?? ""), xs2[2] + wCPF2 / 2, rowY + rowH / 2 + 3, { align: "center" });
    }
  });
  y += rowH * linhas.length;

  // ————— Rodapé: caixa de assinatura só na última folha —————
  if (ehUltima) {
    y += 10;
    caixaAssinaturaInstrutor(doc, W, marginX, y);
  }
  rodapeControle(doc, W, H, marginX, lista.aula.data, pageNo, totalDocPag, paginaLista, totalPaginasLista);
}

// Folhas 2..N — sem cabeçalho institucional e sem cabeçalho de colunas.
// A tabela recomeça do topo com numeração contínua e as mesmas larguras.
function renderContinuacaoPDF(
  doc: jsPDF,
  lista: ListaData,
  linhas: Cursista[],
  W: number,
  H: number,
  pageNo: number,
  totalDocPag: number,
  paginaLista: number,
  totalPaginasLista: number,
  ehUltima: boolean,
) {
  const marginX = 28;
  const tableX = marginX;
  const tableW = W - marginX * 2;
  const xs = calcularXs(marginX, tableW);
  const wNo = xs[1] - xs[0];
  const wNome = xs[2] - xs[1];
  const wCPF = xs[3] - xs[2];

  const yTop = 34;
  const bottomLimite = H - 28;
  const reservaAssinatura = ehUltima ? 52 : 0;
  const rowH = Math.max(
    16,
    Math.min(22, Math.floor((bottomLimite - yTop - reservaAssinatura) / linhas.length)),
  );

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const anteriores = LINHAS_PRIMEIRA_PAGINA + Math.max(0, paginaLista - 2) * LINHAS_CONTINUACAO;
  const numeroInicial = anteriores + 1;

  linhas.forEach((c, i) => {
    const rowY = yTop + i * rowH;
    doc.rect(tableX, rowY, tableW, rowH);
    for (let j = 1; j < xs.length - 1; j += 1) {
      doc.line(xs[j], rowY, xs[j], rowY + rowH);
    }
    const numero = String(numeroInicial + i).padStart(2, "0");
    doc.text(numero, xs[0] + wNo / 2, rowY + rowH / 2 + 3, { align: "center" });
    if (c.nome) {
      const maxNomeW = wNome - 8;
      const nome = doc.splitTextToSize(c.nome, maxNomeW)[0] as string;
      doc.text(nome, xs[1] + 4, rowY + rowH / 2 + 3);
    }
    if (c.cpf) {
      doc.text(formatarCPF(c.cpf ?? ""), xs[2] + wCPF / 2, rowY + rowH / 2 + 3, { align: "center" });
    }
  });
  let y = yTop + rowH * linhas.length;

  if (ehUltima) {
    y += 10;
    caixaAssinaturaInstrutor(doc, W, marginX, y);
  }
  rodapeControle(doc, W, H, marginX, lista.aula.data, pageNo, totalDocPag, paginaLista, totalPaginasLista);
}

// -------------------------------- XLSX --------------------------------

export async function gerarListaXLSX(listas: ListaData[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PMC — Mulheres Conectadas";

  listas.forEach((lista, idx) => {
    const nome = `${(lista.turma.codigo ?? "Turma").slice(0, 20)} ${idx + 1}`.trim().slice(0, 31);
    const ws = wb.addWorksheet(nome, { pageSetup: { paperSize: 9, orientation: "portrait", margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
    ws.columns = [
      { width: 5 },   // Nº
      { width: 42 },  // Nome
      { width: 18 },  // CPF
      { width: 32 },  // Assinatura
    ];

    ws.mergeCells("A1:D1");
    ws.getCell("A1").value = "PROGRAMA MANUEL QUERINO — MULHERES CONECTADAS";
    ws.getCell("A1").font = { bold: true, size: 12, color: { argb: "FF1A2B52" } };
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 22;

    ws.mergeCells("A2:D2");
    ws.getCell("A2").value = "LISTA DE FREQUÊNCIA DOS CURSISTAS ÀS AULAS TEÓRICAS E PRÁTICAS";
    ws.getCell("A2").font = { bold: true, size: 10 };
    ws.getCell("A2").alignment = { horizontal: "center" };

    const meta: [string, string, string, string][] = [
      ["Turma:", `${lista.turma.codigo ?? "—"}${lista.turma.nomeCurso ? " · " + lista.turma.nomeCurso : ""}`, "Município:", lista.turma.municipio ?? "—"],
      ["Turno:", lista.turma.turno ?? "—", "Local:", lista.turma.local ?? "—"],
      ["Data da aula:", formatarDataBR(lista.aula.data), "Carga horária:", lista.aula.cargaHoraria ?? "—"],
      ["Tema/Conteúdo:", lista.aula.tema ?? "—", "Instrutor(a):", lista.aula.instrutor ?? ""],
    ];
    meta.forEach((linha, i) => {
      const r = 4 + i;
      ws.getCell(`A${r}`).value = linha[0];
      ws.getCell(`A${r}`).font = { bold: true, size: 9 };
      ws.getCell(`B${r}`).value = linha[1];
      ws.getCell(`B${r}`).font = { size: 9 };
      ws.getCell(`C${r}`).value = linha[2];
      ws.getCell(`C${r}`).font = { bold: true, size: 9 };
      ws.getCell(`D${r}`).value = linha[3];
      ws.getCell(`D${r}`).font = { size: 9 };
    });

    const headerRow = 9;
    ["Nº", "Nome completo", "CPF", "Assinatura"].forEach((h, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A2B52" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    ws.getRow(headerRow).height = 20;

    const cursistas = ordenarCursistas(lista.cursistas);
    const total = cursistas.length + lista.extras;
    for (let i = 0; i < total; i += 1) {
      const r = headerRow + 1 + i;
      const nome = i < cursistas.length ? cursistas[i].nome : "";
      const cpf = i < cursistas.length ? formatarCPF(cursistas[i].cpf ?? "") : "";
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 2).value = nome;
      ws.getCell(r, 3).value = cpf;
      ws.getCell(r, 4).value = "";
      ws.getRow(r).height = 22;
      for (let c = 1; c <= 4; c += 1) {
        const cell = ws.getCell(r, c);
        cell.border = { top: { style: "thin", color: { argb: "FFBEBEBE" } }, bottom: { style: "thin", color: { argb: "FFBEBEBE" } }, left: { style: "thin", color: { argb: "FFBEBEBE" } }, right: { style: "thin", color: { argb: "FFBEBEBE" } } };
        cell.font = { size: 10 };
        if (c === 1 || c === 3) cell.alignment = { horizontal: "center", vertical: "middle" };
        else cell.alignment = { vertical: "middle" };
      }
    }

    const footerR = headerRow + 1 + total + 2;
    ws.getCell(`A${footerR}`).value = "Assinatura do(a) Instrutor(a):";
    ws.getCell(`A${footerR}`).font = { bold: true, size: 9 };
    ws.mergeCells(`B${footerR}:D${footerR}`);
    ws.getCell(`A${footerR + 2}`).value = "Coordenação Pedagógica:";
    ws.getCell(`A${footerR + 2}`).font = { bold: true, size: 9 };
    ws.mergeCells(`B${footerR + 2}:D${footerR + 2}`);
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// -------------------------------- DOCX --------------------------------

export async function gerarListaDOCX(listas: ListaData[]): Promise<Blob> {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  const secoes = listas.map((lista, idx) => {
    const cursistas = ordenarCursistas(lista.cursistas);
    const total = cursistas.length + lista.extras;

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        cellHeader("Nº", 700),
        cellHeader("Nome completo", 4500),
        cellHeader("CPF", 1800),
        cellHeader("Assinatura", 2360),
      ],
    });
    const linhas: TableRow[] = [];
    for (let i = 0; i < total; i += 1) {
      const nome = i < cursistas.length ? cursistas[i].nome : "";
      const cpf = i < cursistas.length ? formatarCPF(cursistas[i].cpf ?? "") : "";
      linhas.push(new TableRow({
        children: [
          cellBody(String(i + 1), 700, "center"),
          cellBody(nome, 4500),
          cellBody(cpf, 1800, "center"),
          cellBody("", 2360),
        ],
      }));
    }

    const tabela = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [700, 4500, 1800, 2360],
      rows: [headerRow, ...linhas],
    });

    const bloco: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          idx > 0 ? new PageBreak() : new TextRun(""),
          new TextRun({ text: "PROGRAMA MANUEL QUERINO — MULHERES CONECTADAS", bold: true, size: 24, color: "1A2B52" }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Lista de Frequência dos Cursistas às Aulas Teóricas e Práticas", bold: true, size: 20 })],
        spacing: { after: 120 },
      }),
      metaLinha(`Turma: ${lista.turma.codigo ?? "—"}${lista.turma.nomeCurso ? " · " + lista.turma.nomeCurso : ""}`, `Município: ${lista.turma.municipio ?? "—"}`),
      metaLinha(`Turno: ${lista.turma.turno ?? "—"}`, `Local: ${lista.turma.local ?? "—"}`),
      metaLinha(`Data da aula: ${formatarDataBR(lista.aula.data)}`, `Carga horária: ${lista.aula.cargaHoraria ?? "—"}`),
      metaLinha(`Tema/Conteúdo: ${lista.aula.tema ?? "—"}`, `Instrutor(a): ${lista.aula.instrutor ?? "________________________"}`),
      new Paragraph({ children: [new TextRun("")], spacing: { after: 80 } }),
    ];

    const rodape: Paragraph[] = [
      new Paragraph({ children: [new TextRun("")], spacing: { before: 240 } }),
      new Paragraph({ children: [new TextRun({ text: "____________________________________     ____________________________________", size: 18 })] }),
      new Paragraph({ children: [new TextRun({ text: "Assinatura do(a) Instrutor(a)                      Coordenação Pedagógica", size: 16 })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `Data de referência: ${dataPorExtenso(lista.aula.data)}`, size: 16, italics: true })],
        spacing: { before: 120 },
      }),
    ];

    return [...bloco, tabela, ...rodape];

    function cellHeader(text: string, w: number): TableCell {
      return new TableCell({
        width: { size: w, type: WidthType.DXA },
        borders: cellBorders,
        shading: { fill: "1A2B52", type: "clear" as any, color: "auto" },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18 })] })],
      });
    }
    function cellBody(text: string, w: number, align: "center" | "left" = "left"): TableCell {
      return new TableCell({
        width: { size: w, type: WidthType.DXA },
        borders: cellBorders,
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
        children: [new Paragraph({ alignment: align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text, size: 18 })] })],
      });
    }
    function metaLinha(esq: string, dir: string): Paragraph {
      return new Paragraph({
        children: [
          new TextRun({ text: esq, bold: false, size: 18 }),
          new TextRun({ text: "     " }),
          new TextRun({ text: dir, bold: false, size: 18 }),
        ],
        spacing: { after: 60 },
      });
    }
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: secoes.flat(),
    }],
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}

// -------------------------------- Download helper --------------------------------

export function baixarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}