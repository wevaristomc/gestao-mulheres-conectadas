import { jsPDF } from "jspdf";

export type CertificadoData = {
  nome: string;
  cpf?: string | null;
  turma: string;
  projeto?: string | null;
  dataConclusao: Date;
  observacoes?: string | null;
};

export function gerarCertificadoPDF(data: CertificadoData): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Moldura
  doc.setDrawColor(120, 60, 160);
  doc.setLineWidth(4);
  doc.rect(24, 24, W - 48, H - 48);
  doc.setLineWidth(1);
  doc.rect(36, 36, W - 72, H - 72);

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 40, 120);
  doc.setFontSize(34);
  doc.text("CERTIFICADO", W / 2, 110, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(14);
  doc.text("de Qualificação Profissional", W / 2, 138, { align: "center" });

  // Corpo
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(13);
  doc.text("Certificamos que", W / 2, 200, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(data.nome, W / 2, 240, { align: "center" });

  if (data.cpf) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text(`CPF: ${data.cpf}`, W / 2, 260, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  const projetoLinha = data.projeto ? ` no âmbito do projeto ${data.projeto},` : "";
  const texto =
    `concluiu com aproveitamento a formação da turma "${data.turma}"${projetoLinha}` +
    ` estando qualificada nesta data.`;
  const linhas = doc.splitTextToSize(texto, W - 220);
  doc.text(linhas, W / 2, 300, { align: "center" });

  if (data.observacoes) {
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    const obs = doc.splitTextToSize(data.observacoes, W - 260);
    doc.text(obs, W / 2, 360, { align: "center" });
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
  doc.text("Coordenação — Mulheres Conectadas", W / 2, H - 72, { align: "center" });

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