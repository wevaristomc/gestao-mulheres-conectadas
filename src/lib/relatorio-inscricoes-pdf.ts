import { jsPDF } from "jspdf";

import type { RelatorioInscricoesRegiao } from "@/lib/inscricoes-digitais.functions";

function texto(valor: unknown): string {
  if (valor == null || valor === "") return "—";
  return String(valor);
}

function escreverQuebrado(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 12,
): number {
  const linhas = doc.splitTextToSize(text || "—", maxWidth) as string[];
  linhas.forEach((linha, index) => doc.text(linha, x, y + index * lineHeight));
  return y + linhas.length * lineHeight;
}

export function gerarPdfRelatorioInscricoesPorRegiao(params: {
  relatorio: RelatorioInscricoesRegiao;
  analise?: string | null;
}) {
  const { relatorio, analise } = params;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 42;
  let y = margin;
  const novaPaginaSePreciso = (altura = 40) => {
    if (y + altura > H - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setTextColor(5, 36, 77);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Relatório de inscrições por região", margin, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Gerado em ${new Date(relatorio.geradoEm).toLocaleString("pt-BR")}`, margin, y);
  y += 28;

  doc.setFillColor(245, 176, 51);
  doc.roundedRect(margin, y, W - margin * 2, 54, 8, 8, "F");
  doc.setTextColor(5, 36, 77);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Total: ${relatorio.total}`, margin + 16, y + 22);
  doc.text(`Pendentes: ${relatorio.pendentes}`, margin + 160, y + 22);
  doc.text(
    `Demanda sem oferta: ${relatorio.linhas.filter((linha) => linha.demandaSemOferta).length}`,
    margin + 320,
    y + 22,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    Object.entries(relatorio.porTurno)
      .map(([turno, total]) => `${turno}: ${total}`)
      .join(" · ") || "Sem turnos informados",
    margin + 16,
    y + 42,
  );
  y += 78;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(5, 36, 77);
  doc.text("Resumo por município", margin, y);
  y += 18;
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  relatorio.porMunicipio.forEach((mun) => {
    novaPaginaSePreciso(22);
    doc.setFont("helvetica", "bold");
    doc.text(
      `${mun.municipio}: ${mun.total} inscrição(ões), ${mun.pendentes} pendente(s)`,
      margin,
      y,
    );
    doc.setFont("helvetica", "normal");
    doc.text(
      `Turmas: ${mun.turmas} · Vagas: ${mun.vagas} · ${Object.entries(mun.porTurno)
        .map(([turno, total]) => `${turno}: ${total}`)
        .join(" · ")}`,
      margin,
      y + 12,
    );
    y += 28;
  });

  y += 8;
  novaPaginaSePreciso(60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(5, 36, 77);
  doc.text("Detalhamento por bairro e turno", margin, y);
  y += 18;
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  relatorio.linhas.slice(0, 80).forEach((linha) => {
    novaPaginaSePreciso(32);
    doc.setFont("helvetica", "bold");
    doc.text(`${linha.municipio} · ${linha.bairroReferencia} · ${linha.turnoPreferido}`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Total ${linha.total} | Pend. ${linha.pendentes} | Rev. ${linha.emRevisao} | Apr. ${linha.aprovadas} | Rej. ${linha.rejeitadas} | Dup. ${linha.duplicadas} | Turmas ${linha.turmas} | Vagas ${linha.vagas}${linha.demandaSemOferta ? " | ALERTA demanda/oferta" : ""}`,
      margin,
      y + 12,
    );
    y += 28;
  });

  if (analise?.trim()) {
    y += 10;
    novaPaginaSePreciso(80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(5, 36, 77);
    doc.text("Análise da IA", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    for (const paragrafo of analise.split(/\n{2,}/)) {
      novaPaginaSePreciso(70);
      y = escreverQuebrado(doc, paragrafo.trim(), margin, y, W - margin * 2, 12) + 8;
    }
  }

  doc.save(`relatorio-inscricoes-regiao-${new Date().toISOString().slice(0, 10)}.pdf`);
}
