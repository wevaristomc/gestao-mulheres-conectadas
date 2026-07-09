import { jsPDF } from "jspdf";
import ExcelJS from "exceljs";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table,
  TableCell, TableRow, TextRun, WidthType, PageBreak,
} from "docx";

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
// que não seja de posse da entidade). Formatamos como 000.000.000-00.
function formatarCPF(cpf: string | null): string {
  if (!cpf) return "";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarDataBR(iso: string | null): string {
  if (!iso) return "___/___/______";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR");
}

function dataPorExtenso(iso: string | null): string {
  if (!iso) return "_____________________________";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function ordenarCursistas(rows: Cursista[]): Cursista[] {
  return [...rows].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

const LINHAS_POR_PAGINA = 25;

function paginarCursistas(cursistas: Cursista[], extras: number): Cursista[][] {
  const rows: Cursista[] = [...cursistas];
  for (let i = 0; i < extras; i += 1) rows.push({ nome: "", cpf: null });
  // sempre ao menos uma página com 25 linhas
  const total = Math.max(rows.length, LINHAS_POR_PAGINA);
  const paginas: Cursista[][] = [];
  for (let i = 0; i < total; i += LINHAS_POR_PAGINA) {
    const slice = rows.slice(i, i + LINHAS_POR_PAGINA);
    while (slice.length < LINHAS_POR_PAGINA) slice.push({ nome: "", cpf: null });
    paginas.push(slice);
  }
  return paginas;
}

// -------------------------------- PDF --------------------------------

export function gerarListaPDF(listas: ListaData[]): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const paginasPorLista = listas.map((l) => paginarCursistas(ordenarCursistas(l.cursistas), l.extras));
  const totalPag = paginasPorLista.reduce((a, p) => a + p.length, 0);
  let pageNo = 0;
  listas.forEach((lista, i) => {
    const paginas = paginasPorLista[i];
    paginas.forEach((linhas, pi) => {
      pageNo += 1;
      if (pageNo > 1) doc.addPage();
      renderPaginaPDF(doc, lista, linhas, W, H, pageNo, totalPag, pi + 1, paginas.length);
    });
  });

  return doc.output("blob");
}

/**
 * Renderiza uma página da lista de frequência no formato oficial DEQ/PMQ.
 * Cabeçalho institucional + bloco de metadados + tabela com colunas exatas
 * (Nº | Nome | CPF | Data + Frequência | Entrega do Lanche | Assinatura).
 */
function renderPaginaPDF(
  doc: jsPDF,
  lista: ListaData,
  linhas: Cursista[],
  W: number,
  H: number,
  pageNo: number,
  totalDocPag: number,
  paginaLista: number,
  totalPaginasLista: number,
) {
  const AZUL: [number, number, number] = [27, 42, 74];
  const marginX = 28;
  let y = 34;

  // ————— Cabeçalho institucional (bloco em caixa) —————
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.8);

  // Título principal
  doc.setFillColor(...AZUL);
  doc.rect(marginX, y, W - marginX * 2, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(
    "LISTA DE FREQUÊNCIA DOS CURSISTAS AS AULAS TEÓRICAS E PRÁTICAS",
    W / 2, y + 15, { align: "center" },
  );
  y += 22;

  doc.setTextColor(...AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.rect(marginX, y, W - marginX * 2, 18);
  doc.text(
    "Programa Manuel Querino de Qualificação Social e Profissional — PMQ / DEQ / SEMP / MTE",
    W / 2, y + 12, { align: "center" },
  );
  y += 18;

  // Bloco de metadados
  const entidade = (lista.turma.entidade ?? "QUINTA ARTE").toUpperCase();
  const local = lista.turma.local ?? "";
  const identTurma = `${lista.turma.codigo ?? ""}${lista.turma.nomeCurso ? " · " + lista.turma.nomeCurso : ""}`;
  const conteudo = lista.aula.tema ?? "";
  const instrutor = lista.aula.instrutor ?? "";
  const horaIni = lista.aula.horaInicio ?? "____";
  const horaFim = lista.aula.horaFim ?? "____";
  const ch = lista.aula.cargaHoraria ?? "____";

  const campos: [string, string][] = [
    ["Nome da Entidade Executora:", entidade],
    ["Local de Realização da Qualificação:", local],
    ["Identificação da Turma:", identTurma],
    ["Conteúdo das Aulas:", conteudo],
    ["Instrutor/a:", instrutor],
    [
      "Horário de Início e Fim das Aulas:",
      `${horaIni} às ${horaFim}`,
    ],
    [
      "Carga Horária Total/Dia:",
      `${ch} horas    Quantidade de Cursistas Presentes na Aula: ____`,
    ],
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  const linhaAlt = 16;
  campos.forEach(([label, valor]) => {
    doc.rect(marginX, y, W - marginX * 2, linhaAlt);
    doc.setFont("helvetica", "bold");
    doc.text(label, marginX + 6, y + 11);
    doc.setFont("helvetica", "normal");
    const labelW = doc.getTextWidth(label) + 12;
    const disponivel = W - marginX * 2 - labelW - 12;
    doc.text(String(valor).slice(0, 200), marginX + 6 + labelW, y + 11, { maxWidth: disponivel });
    y += linhaAlt;
  });
  y += 4;

  // ————— Tabela de cursistas —————
  const tableX = marginX;
  const tableW = W - marginX * 2;
  // colunas: Nº | Nome | CPF | Data/Frequência | Lanche | Assinatura
  const wNo = 22;
  const wNome = 170;
  const wCPF = 76;
  const wFreq = 74;
  const wLanche = 74;
  const wAss = tableW - (wNo + wNome + wCPF + wFreq + wLanche);
  const xs = [
    tableX,
    tableX + wNo,
    tableX + wNo + wNome,
    tableX + wNo + wNome + wCPF,
    tableX + wNo + wNome + wCPF + wFreq,
    tableX + wNo + wNome + wCPF + wFreq + wLanche,
    tableX + tableW,
  ];

  const headerH = 30;
  doc.setFillColor(...AZUL);
  doc.rect(tableX, y, tableW, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);

  const dataLabel = formatarDataBR(lista.aula.data);
  const headers = [
    "Nº",
    "NOME COMPLETO DO/A CURSISTA\n(digitalizado)",
    "CPF\n(digitalizado)",
    `Data ${dataLabel}\nFrequência`,
    "ENTREGA DO LANCHE\n(QUANDO FOR DIÁRIO)",
    "ASSINATURA DO/A\nCURSISTA",
  ];
  headers.forEach((h, i) => {
    const cx = xs[i] + (xs[i + 1] - xs[i]) / 2;
    const partes = h.split("\n");
    partes.forEach((p, j) => {
      doc.text(p, cx, y + 12 + j * 9, { align: "center" });
    });
  });
  // grade do header
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  for (let i = 1; i < xs.length - 1; i += 1) {
    doc.line(xs[i], y, xs[i], y + headerH);
  }
  y += headerH;

  // linhas
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.4);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const linhaTabH = Math.min(
    24,
    Math.floor((H - y - 60) / linhas.length),
  );
  const rowH = Math.max(18, linhaTabH);
  const numeroInicial = (paginaLista - 1) * LINHAS_POR_PAGINA + 1;
  linhas.forEach((c, i) => {
    const rowY = y + i * rowH;
    doc.rect(tableX, rowY, tableW, rowH);
    for (let j = 1; j < xs.length - 1; j += 1) {
      doc.line(xs[j], rowY, xs[j], rowY + rowH);
    }
    const numero = String(numeroInicial + i).padStart(2, "0");
    doc.text(numero, xs[0] + wNo / 2, rowY + rowH / 2 + 3, { align: "center" });
    if (c.nome) {
      doc.text(c.nome.slice(0, 44), xs[1] + 4, rowY + rowH / 2 + 3);
    }
    if (c.cpf) {
      doc.text(formatarCPF(c.cpf), xs[2] + wCPF / 2, rowY + rowH / 2 + 3, { align: "center" });
    }
  });
  y += rowH * linhas.length;

  // ————— Rodapé: assinatura do instrutor —————
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text("ASSINATURA DO/A INSTRUTOR/A:", marginX, y);
  doc.setLineWidth(0.6);
  doc.line(marginX + doc.getTextWidth("ASSINATURA DO/A INSTRUTOR/A:") + 8, y + 2, W - marginX, y + 2);

  // Página X/Y
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Página ${pageNo}/${totalDocPag}${totalPaginasLista > 1 ? ` — folha ${paginaLista}/${totalPaginasLista}` : ""}`,
    W - marginX, H - 16, { align: "right" },
  );
  doc.text(`Data de referência: ${dataPorExtenso(lista.aula.data)}`, marginX, H - 16);
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
      const cpf = i < cursistas.length ? mascararCPF(cursistas[i].cpf) : "";
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
      const cpf = i < cursistas.length ? mascararCPF(cursistas[i].cpf) : "";
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