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
  entidade?: string | null;
  dataInicio?: Date | null;
  dataFim?: Date | null;
};

/**
 * Certificado de Conclusão — layout oficial PMQ.
 * Paisagem A4. Fundo creme. Faixa esquerda com padrão de triângulos terracota.
 * Emblema PMQ no topo direito (desenhado programaticamente para manter API síncrona).
 * Rodapé com faixa institucional (PMQ / FAT / SRTE / MTE / Governo Federal).
 */
export function gerarCertificadoPDF(data: CertificadoData): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ————— Cores institucionais —————
  const CREME: [number, number, number] = [250, 243, 220]; // #FAF3DC
  const AZUL: [number, number, number] = [27, 42, 74]; // #1B2A4A
  const TERRACOTA: [number, number, number] = [217, 108, 71]; // #D96C47
  const TERRACOTA_ESC: [number, number, number] = [194, 82, 50]; // #C25232
  const CINZA_TXT: [number, number, number] = [45, 45, 45];

  // Fundo creme
  doc.setFillColor(...CREME);
  doc.rect(0, 0, W, H, "F");

  // ————— Faixa vertical esquerda com padrão de triângulos —————
  const bandW = W * 0.15;
  desenharFaixaTriangulos(doc, 0, 0, bandW, H, TERRACOTA, TERRACOTA_ESC);

  // ————— Emblema PMQ no topo direito —————
  desenharEmblemaPMQ(doc, W - 96, 60, 36, AZUL);

  // ————— Título principal —————
  const contentX = bandW + 40;
  const contentW = W - contentX - 40;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...AZUL);
  doc.setFontSize(11);
  doc.text("PROGRAMA MANUEL QUERINO", contentX, 76);

  doc.setFontSize(36);
  doc.text("CERTIFICADO", contentX, 118);
  doc.setFontSize(22);
  doc.text("DE CONCLUSÃO", contentX, 148);

  // ————— Corpo —————
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...AZUL);
  doc.setFontSize(13);
  doc.text("Certifico que", contentX, 192);

  // Linha do nome
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...CINZA_TXT);
  doc.text(data.nome, contentX, 226);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.line(contentX, 232, contentX + contentW, 232);

  if (data.cpf) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`CPF: ${data.cpf}`, contentX, 246);
  }

  // Texto corrido (modelo oficial DEQ/PMQ)
  const dataConcl = data.dataConclusao;
  const diaConcl = String(dataConcl.getDate()).padStart(2, "0");
  const mesConcl = mesExtenso(dataConcl.getMonth());
  const anoConcl = String(dataConcl.getFullYear()).slice(-2);
  const curso = data.curso ?? data.turma ?? "Mulheres Conectadas – Formação em Tecnologia e Inovação Digital";
  const ch = data.cargaHoraria ?? 150;
  const periodoTxt = data.periodo
    ?? (data.dataInicio && data.dataFim
      ? `${formatarBR(data.dataInicio)} a ${formatarBR(data.dataFim)}`
      : "__/__/____ a __/__/____");
  const entidade = (data.entidade ?? "QUINTA ARTE").toUpperCase();

  const texto =
    `em ${diaConcl}, de ${mesConcl} de 20${anoConcl}, a Sr.ª acima nominada concluiu, realizando ` +
    `satisfatoriamente as tarefas propostas, o curso de "${curso}", com carga horária total de ${ch} horas, ` +
    `realizado no período de ${periodoTxt}${data.municipio ? `, no município de ${data.municipio}` : ""}, ` +
    `na entidade ${entidade}.`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...CINZA_TXT);
  const linhas = doc.splitTextToSize(texto, contentW);
  doc.text(linhas, contentX, 274, { lineHeightFactor: 1.5 });

  if (data.observacoes) {
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    const obs = doc.splitTextToSize(data.observacoes, contentW);
    doc.text(obs, contentX, 274 + linhas.length * 18 + 12, { lineHeightFactor: 1.4 });
  }

  // ————— Assinaturas (centro inferior) —————
  const sigY = H - 128;
  const sigW = 240;
  const gap = 60;
  const totalW = sigW * 2 + gap;
  const sigX1 = contentX + (contentW - totalW) / 2;
  const sigX2 = sigX1 + sigW + gap;

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.6);
  doc.line(sigX1, sigY, sigX1 + sigW, sigY);
  doc.line(sigX2, sigY, sigX2 + sigW, sigY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA_TXT);
  doc.text("Assinatura do/a responsável pela entidade", sigX1 + sigW / 2, sigY + 12, { align: "center" });
  doc.text("Assinatura do/a concluinte", sigX2 + sigW / 2, sigY + 12, { align: "center" });

  // ————— Rodapé institucional —————
  desenharRodapeInstitucional(doc, bandW, W, H, AZUL);

  // Nº do certificado (canto inferior direito, discreto)
  if (data.numero) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Certificado nº ${data.numero}`, W - 24, H - 8, { align: "right" });
  }

  return doc.output("blob");
}

// ————————————————————————————————————————————————————————————————
// Helpers de desenho
// ————————————————————————————————————————————————————————————————

function desenharFaixaTriangulos(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  cor1: [number, number, number],
  cor2: [number, number, number],
) {
  // Base creme claro por baixo (a página já está creme)
  const cols = 3;
  const rows = 10;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = x + c * cw;
      const cy = y + r * ch;
      const usarEscuro = (r + c) % 2 === 0;
      const cor = usarEscuro ? cor2 : cor1;
      // alterna orientação do triângulo por linha/coluna
      const orient = (r * cols + c) % 4;
      doc.setFillColor(...cor);
      doc.setDrawColor(...cor);
      let tri: [number, number][];
      if (orient === 0) tri = [[cx, cy], [cx + cw, cy], [cx, cy + ch]];
      else if (orient === 1) tri = [[cx + cw, cy], [cx + cw, cy + ch], [cx, cy + ch]];
      else if (orient === 2) tri = [[cx, cy], [cx + cw, cy], [cx + cw, cy + ch]];
      else tri = [[cx, cy], [cx + cw, cy + ch], [cx, cy + ch]];
      doc.triangle(tri[0][0], tri[0][1], tri[1][0], tri[1][1], tri[2][0], tri[2][1], "F");
      // pequeno quadrado sobreposto para textura
      if ((r + c) % 3 === 0) {
        doc.setFillColor(cor[0], cor[1], cor[2]);
        const s = Math.min(cw, ch) * 0.18;
        doc.rect(cx + cw / 2 - s / 2, cy + ch / 2 - s / 2, s, s, "F");
      }
    }
  }
}

function desenharEmblemaPMQ(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  azul: [number, number, number],
) {
  // Círculo azul-marinho de fundo
  doc.setFillColor(...azul);
  doc.circle(cx, cy, r, "F");
  // Faixas laranja/âmbar diagonais (base do rosto estilizado)
  doc.setFillColor(240, 158, 48); // âmbar
  doc.triangle(cx - r, cy + r * 0.15, cx + r, cy + r * 0.15, cx + r, cy + r * 0.55, "F");
  doc.setFillColor(217, 108, 71); // terracota
  doc.triangle(cx - r, cy + r * 0.55, cx + r, cy + r * 0.55, cx + r, cy + r * 0.9, "F");
  // Rosto — círculo creme
  doc.setFillColor(250, 243, 220);
  doc.circle(cx, cy - r * 0.15, r * 0.35, "F");
  // Sigla
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...azul);
  doc.text("PMQ", cx, cy - r * 0.13, { align: "center" });
}

function desenharRodapeInstitucional(
  doc: jsPDF,
  bandW: number,
  W: number,
  H: number,
  azul: [number, number, number],
) {
  const y = H - 56;
  const x0 = bandW + 20;
  const x1 = W - 20;

  // Linha separadora
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.6);
  doc.line(x0, y, x1, y);

  const labels = [
    "Programa Manuel Querino",
    "QUINTA ARTE",
    "FAT — Fundo de Amparo ao Trabalhador",
    "SRTE",
    "Ministério do Trabalho e Emprego",
    "Governo Federal — BRASIL",
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...azul);
  const step = (x1 - x0) / labels.length;
  labels.forEach((label, i) => {
    const cx = x0 + step * i + step / 2;
    doc.text(label, cx, y + 18, { align: "center", maxWidth: step - 8 });
  });
}

function mesExtenso(m: number): string {
  return [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ][m] ?? "";
}

function formatarBR(d: Date): string {
  return d.toLocaleDateString("pt-BR");
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