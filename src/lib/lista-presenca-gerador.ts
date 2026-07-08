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
};
export type TurmaInfo = {
  codigo: string | null;
  nomeCurso: string | null;
  municipio: string | null;
  turno: string | null;
  local: string | null;
};
export type ListaData = {
  turma: TurmaInfo;
  aula: AulaInfo;
  cursistas: Cursista[];
  extras: number;
};

function mascararCPF(cpf: string | null): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length < 4) return "***.***.***-**";
  return `***.***.***-${d.slice(-2)}`;
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

// -------------------------------- PDF --------------------------------

export function gerarListaPDF(listas: ListaData[]): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  listas.forEach((lista, idx) => {
    if (idx > 0) doc.addPage();
    renderPaginaPDF(doc, lista, W, H, idx + 1, listas.length);
  });

  return doc.output("blob");
}

function renderPaginaPDF(
  doc: jsPDF, lista: ListaData, W: number, H: number, pageNo: number, total: number,
) {
  const marginX = 36;
  let y = 40;

  // Cabeçalho institucional
  doc.setDrawColor(26, 43, 82);
  doc.setLineWidth(1);
  doc.rect(marginX, y, W - marginX * 2, 54);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 43, 82);
  doc.setFontSize(12);
  doc.text("PROGRAMA MANUEL QUERINO — MULHERES CONECTADAS", W / 2, y + 20, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(
    "LISTA DE FREQUÊNCIA DOS CURSISTAS ÀS AULAS TEÓRICAS E PRÁTICAS",
    W / 2, y + 40, { align: "center" },
  );
  y += 70;

  // Metadados
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  const col1X = marginX;
  const col2X = W / 2 + 6;
  const linhaH = 14;

  const meta: [string, string][] = [
    ["Turma:", `${lista.turma.codigo ?? "—"}${lista.turma.nomeCurso ? " · " + lista.turma.nomeCurso : ""}`],
    ["Município:", lista.turma.municipio ?? "—"],
    ["Turno:", lista.turma.turno ?? "—"],
    ["Local:", lista.turma.local ?? "—"],
    ["Data da aula:", formatarDataBR(lista.aula.data)],
    ["Carga horária:", lista.aula.cargaHoraria ?? "—"],
    ["Tema/Conteúdo:", lista.aula.tema ?? "—"],
    ["Instrutor(a):", lista.aula.instrutor ?? "________________________"],
  ];
  for (let i = 0; i < meta.length; i += 2) {
    doc.setFont("helvetica", "bold");
    doc.text(meta[i][0], col1X, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(meta[i][1]).slice(0, 60), col1X + 78, y);
    if (meta[i + 1]) {
      doc.setFont("helvetica", "bold");
      doc.text(meta[i + 1][0], col2X, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(meta[i + 1][1]).slice(0, 55), col2X + 78, y);
    }
    y += linhaH;
  }
  y += 4;

  // Tabela
  const rows: Array<{ n: number; nome: string; cpf: string }> = [];
  const cursistas = ordenarCursistas(lista.cursistas);
  cursistas.forEach((c, i) => rows.push({ n: i + 1, nome: c.nome, cpf: mascararCPF(c.cpf) }));
  for (let i = 0; i < lista.extras; i += 1) {
    rows.push({ n: cursistas.length + i + 1, nome: "", cpf: "" });
  }

  const colNo = 32;
  const colNome = 220;
  const colCPF = 100;
  const tableX = marginX;
  const tableW = W - marginX * 2;
  const colAss = tableW - colNo - colNome - colCPF;

  // Cabeçalho da tabela
  doc.setFillColor(26, 43, 82);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.rect(tableX, y, tableW, 18, "F");
  doc.text("Nº", tableX + 6, y + 12);
  doc.text("Nome completo", tableX + colNo + 6, y + 12);
  doc.text("CPF", tableX + colNo + colNome + 6, y + 12);
  doc.text("Assinatura", tableX + colNo + colNome + colCPF + 6, y + 12);
  y += 18;

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  const rowH = 22;
  const maxY = H - 90;

  rows.forEach((r) => {
    if (y + rowH > maxY) return; // corta para caber em uma folha
    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.5);
    doc.rect(tableX, y, tableW, rowH);
    doc.line(tableX + colNo, y, tableX + colNo, y + rowH);
    doc.line(tableX + colNo + colNome, y, tableX + colNo + colNome, y + rowH);
    doc.line(tableX + colNo + colNome + colCPF, y, tableX + colNo + colNome + colCPF, y + rowH);
    doc.text(String(r.n), tableX + 6, y + 14);
    doc.text(r.nome.slice(0, 42), tableX + colNo + 6, y + 14);
    doc.text(r.cpf, tableX + colNo + colNome + 6, y + 14);
    y += rowH;
  });

  // Rodapé
  const footerY = H - 70;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.5);
  doc.line(marginX, footerY, marginX + 220, footerY);
  doc.line(W - marginX - 220, footerY, W - marginX, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text("Assinatura do(a) Instrutor(a)", marginX, footerY + 12);
  doc.text("Coordenação Pedagógica", W - marginX - 220, footerY + 12);
  doc.text(
    `Data de referência: ${dataPorExtenso(lista.aula.data)}`,
    W / 2, footerY + 30, { align: "center" },
  );
  doc.text(`Página ${pageNo}/${total}`, W - marginX, H - 24, { align: "right" });
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