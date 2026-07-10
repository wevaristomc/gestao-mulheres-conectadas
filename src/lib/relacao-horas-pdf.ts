import { jsPDF } from "jspdf";
import type { RelacaoHoras, RelacaoItem } from "./relacao-horas-queries";

const AZUL: [number, number, number] = [91, 139, 208]; // #5B8BD0
const AZUL_CLARO: [number, number, number] = [200, 218, 240];
const DIAS_SEMANA = [
  "DOMINGO",
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
  "SÁBADO",
];

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function fmtHoras(n: number): string {
  const total = Number(n) || 0;
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
function fmtDataHoraBR(iso: string): string {
  const dt = new Date(iso);
  const d = String(dt.getDate()).padStart(2, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const y = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}
function mesExtenso(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const nomes = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
  return `${nomes[m - 1]}/${y}`;
}

export function gerarPdfRelacaoHoras(input: {
  relacao: RelacaoHoras;
  itens: RelacaoItem[];
  professorNome: string;
  professorEmail?: string;
}): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Relação de Horas", pageW / 2, margin + 6, { align: "center" });
  doc.setFontSize(11);
  doc.text(mesExtenso(input.relacao.mes_referencia), pageW / 2, margin + 24, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = margin + 46;
  doc.text(`Prof.: ${input.professorNome}`, margin, y);
  y += 14;
  doc.text(`Local de trabalho: ${input.relacao.local_trabalho ?? "—"}`, margin, y);
  y += 18;

  // Tabela — cabeçalho
  const cols = [
    { key: "data", label: "DATA", w: 60 },
    { key: "dia", label: "DIA DA SEMANA", w: 110 },
    { key: "entrada", label: "HORA ENTRADA", w: 90 },
    { key: "saida", label: "HORA SAÍDA", w: 90 },
    { key: "total", label: "TOTAL HORAS", w: 80 },
    { key: "valor", label: "VALOR HORA DIA (R$)", w: 0 },
  ];
  const usedW = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = pageW - margin * 2 - usedW;

  const rowH = 16;
  const drawHeader = (yStart: number) => {
    doc.setFillColor(...AZUL);
    doc.setTextColor(255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    let x = margin;
    doc.rect(margin, yStart, pageW - margin * 2, rowH + 4, "F");
    cols.forEach((c) => {
      doc.text(c.label, x + c.w / 2, yStart + rowH - 2, { align: "center" });
      x += c.w;
    });
    doc.setTextColor(0);
    return yStart + rowH + 4;
  };

  y = drawHeader(y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const drawRow = (item: RelacaoItem) => {
    const dt = new Date(item.data + "T12:00:00");
    const dow = dt.getDay();
    const isWeekend = dow === 0 || dow === 6;

    if (y + rowH > pageH - 60) {
      // rodapé de continuação
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`continua na próxima página`, pageW - margin, pageH - 20, { align: "right" });
      doc.setTextColor(0);
      doc.addPage();
      y = margin;
      y = drawHeader(y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    let x = margin;
    // fundo azul-claro em data/dia (colunas fixas) — fim de semana pinta a linha inteira
    if (isWeekend) {
      doc.setFillColor(...AZUL_CLARO);
      doc.rect(margin, y, pageW - margin * 2, rowH, "F");
    } else {
      doc.setFillColor(...AZUL_CLARO);
      doc.rect(x, y, cols[0].w + cols[1].w, rowH, "F");
    }
    // bordas
    doc.setDrawColor(180);
    let xB = margin;
    for (const c of cols) {
      doc.rect(xB, y, c.w, rowH, "S");
      xB += c.w;
    }

    const cells = [
      fmtDataBR(item.data),
      DIAS_SEMANA[dow],
      isWeekend ? "" : item.hora_entrada?.slice(0, 5) ?? "",
      isWeekend ? "" : item.hora_saida?.slice(0, 5) ?? "",
      isWeekend || !item.total_horas ? "" : fmtHoras(Number(item.total_horas)),
      isWeekend || !item.valor_dia ? "" : fmtBRL(Number(item.valor_dia)),
    ];
    x = margin;
    cells.forEach((v, i) => {
      doc.text(v, x + cols[i].w / 2, y + rowH - 5, { align: "center" });
      x += cols[i].w;
    });
    y += rowH;
  };

  input.itens.forEach(drawRow);

  // Totais
  if (y + 40 > pageH - 60) {
    doc.addPage();
    y = margin;
  }
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const totalCol = cols[0].w + cols[1].w + cols[2].w + cols[3].w;
  doc.setFillColor(...AZUL_CLARO);
  doc.rect(margin, y, pageW - margin * 2, rowH + 2, "F");
  doc.setDrawColor(180);
  doc.rect(margin, y, pageW - margin * 2, rowH + 2, "S");
  doc.text("TOTAIS", margin + totalCol / 2, y + rowH - 3, { align: "center" });
  doc.text(fmtHoras(Number(input.relacao.total_horas)), margin + totalCol + cols[4].w / 2, y + rowH - 3, { align: "center" });
  doc.text(fmtBRL(Number(input.relacao.valor_total)), margin + totalCol + cols[4].w + cols[5].w / 2, y + rowH - 3, { align: "center" });
  y += rowH + 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Valor Hora: ${fmtBRL(Number(input.relacao.valor_hora))}`, margin, y);
  y += 20;

  // Assinatura digital
  if (input.relacao.assinatura_nome && input.relacao.assinado_em) {
    const hashShort = (input.relacao.assinatura_hash ?? "").slice(0, 8);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(80);
    doc.text(
      `Assinado digitalmente por ${input.relacao.assinatura_nome} em ${fmtDataHoraBR(input.relacao.assinado_em)} — hash ${hashShort}`,
      margin,
      y,
    );
    doc.setTextColor(0);
    y += 28;
  }

  // Linha de assinatura do financeiro
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lineW = 260;
  doc.line(margin, y, margin + lineW, y);
  doc.text("Assinatura do Financeiro / Data", margin, y + 12);

  return doc;
}