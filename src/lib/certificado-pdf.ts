import { jsPDF } from "jspdf";

export type CertificadoData = {
  nome: string;
  cpf?: string | null;
  turma: string;
  projeto?: string | null;
  dataConclusao: Date;
  observacoes?: string | null;
  numero?: string | null;
  curso?: string | null;
  cargaHoraria?: number | null;
  municipio?: string | null;
  periodo?: string | null;
};

export function gerarCertificadoPDF(data: CertificadoData): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Moldura — azul-marinho PMQ
  doc.setDrawColor(26, 43, 82);
  doc.setLineWidth(4);
  doc.rect(24, 24, W - 48, H - 48);
  doc.setDrawColor(212, 85, 43); // terracota
  doc.setLineWidth(1);
  doc.rect(36, 36, W - 72, H - 72);

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 43, 82);
  doc.setFontSize(12);
  doc.text("PROGRAMA MANUEL QUERINO", W / 2, 72, { align: "center" });
  doc.setFontSize(30);
  doc.text("CERTIFICADO", W / 2, 108, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.setFontSize(13);
  doc.text("de Qualificação Profissional", W / 2, 138, { align: "center" });

  // Corpo
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(13);
  doc.text("Certificamos que", W / 2, 188, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(data.nome, W / 2, 220, { align: "center" });

  if (data.cpf) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text(`CPF: ${data.cpf}`, W / 2, 240, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  const curso = data.curso ?? data.turma;
  const ch = data.cargaHoraria ?? 150;
  const mun = data.municipio ? ` no município de ${data.municipio},` : "";
  const per = data.periodo ? ` no período de ${data.periodo},` : "";
  const texto =
    `concluiu com aproveitamento o curso de qualificação profissional "${curso}", ` +
    `com carga horária total de ${ch} horas,${per}${mun} ` +
    `no âmbito do Programa Manuel Querino — Termo de Fomento MROSC — estando devidamente qualificada.`;
  const linhas = doc.splitTextToSize(texto, W - 220);
  doc.text(linhas, W / 2, 280, { align: "center" });

  if (data.observacoes) {
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    const obs = doc.splitTextToSize(data.observacoes, W - 260);
    doc.text(obs, W / 2, 340, { align: "center" });
  }

  // Data + assinatura
  const dataFmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(data.dataConclusao);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(`Emitido em ${dataFmt}`, W / 2, H - 130, { align: "center" });

  doc.setDrawColor(120, 120, 120);
  doc.line(W / 2 - 140, H - 90, W / 2 + 140, H - 90);
  doc.setFontSize(11);
  doc.text("Coordenação — Programa Manuel Querino", W / 2, H - 72, { align: "center" });

  // Número do certificado (rodapé esquerdo)
  if (data.numero) {
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Nº ${data.numero}`, 52, H - 44);
  }

  return doc.output("blob");
}

export function slugifyNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}