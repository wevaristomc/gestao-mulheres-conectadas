import { jsPDF } from "jspdf";

// Cabeçalho institucional oficial DEQ/PMQ (fidelidade ao modelo escaneado
// utilizado em campo pela Quinta Arte). Renderiza uma "tabela" de 2 colunas
// com bordas pretas: coluna esquerda com 5 logos empilhados verticalmente e
// coluna direita com título, subtítulo e campos empilhados.
//
// Os arquivos estão no bucket público `marca` do Supabase. Alguns nomes
// contêm espaços — usamos encodeURI para transformar em URL válida.

const MARCA_BASE =
  "https://yqvocpnvunaprpmhlswn.supabase.co/storage/v1/object/public/marca/";

const LOGO_ARQUIVOS = [
  "logo-quinta arte.jfif",
  "logo quinta arte2.jpg",
  "logo-pmq-horizontal.png",
  "logo-fat-mte-vertical-1.png",
  "3-MTEL.png",
] as const;

export type LogoInstitucional = {
  dataUrl: string;
  format: "JPEG" | "PNG";
  w: number;
  h: number;
};

async function carregarImagem(url: string): Promise<LogoInstitucional | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("img"));
      img.src = dataUrl;
    });
    // .jfif é apenas um JPEG com extensão diferente — tratamos como JPEG.
    const isPng = /\.png(\?|$)/i.test(url) || blob.type === "image/png";
    return { dataUrl, format: isPng ? "PNG" : "JPEG", w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

export async function carregarLogosInstitucionais(): Promise<(LogoInstitucional | null)[]> {
  const urls = LOGO_ARQUIVOS.map((f) => encodeURI(MARCA_BASE + f));
  return Promise.all(urls.map(carregarImagem));
}

export type LinhaCabecalho =
  | { tipo: "titulo"; texto: string }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "campo"; label: string; valor: string; sublinhar?: boolean }
  | {
      tipo: "dois-campos";
      a: { label: string; valor: string; sublinhar?: boolean };
      b: { label: string; valor: string; sublinhar?: boolean };
    };

/**
 * Renderiza o cabeçalho e devolve o Y logo abaixo dele.
 *
 * A altura do cabeçalho é definida pela soma das alturas do lado direito
 * (títulos + campos); a coluna esquerda (logos) se estende como célula única
 * com essa mesma altura ("rowspan"), imitando o modelo oficial.
 */
export function renderCabecalhoInstitucional(
  doc: jsPDF,
  opts: {
    W: number;
    marginX: number;
    yStart: number;
    linhas: LinhaCabecalho[];
    logos: (LogoInstitucional | null)[];
  },
): number {
  const { W, marginX, yStart, linhas, logos } = opts;
  const usableW = W - marginX * 2;
  const leftW = Math.round(usableW * 0.30);
  const rightX = marginX + leftW;
  const rightW = usableW - leftW;

  // Altura TOTAL fixa do cabeçalho institucional (~35% do A4). Nada de
  // crescer conforme o número/proporção dos logos.
  const ALTURA_TOTAL = 290;
  const alturaTotal = ALTURA_TOTAL;

  // Alturas compactas por tipo de linha. Se o texto quebrar, ampliamos a
  // altura da linha correspondente proporcional ao nº de linhas.
  doc.setFont("helvetica", "bold");
  const alturas = linhas.map((l) => {
    if (l.tipo === "titulo") {
      doc.setFontSize(10.5);
      const n = (doc.splitTextToSize(l.texto, rightW - 12) as string[]).length;
      return Math.max(28, n * 13 + 6);
    }
    if (l.tipo === "subtitulo") {
      doc.setFontSize(8.5);
      const n = (doc.splitTextToSize(l.texto, rightW - 12) as string[]).length;
      return Math.max(18, n * 10 + 4);
    }
    if (l.tipo === "campo") {
      doc.setFontSize(8.5);
      const labelW = doc.getTextWidth(l.label) + 12;
      const disponivel = rightW - labelW - 12;
      doc.setFont("helvetica", "normal");
      const n = disponivel > 40
        ? (doc.splitTextToSize(l.valor || "", disponivel) as string[]).length
        : 1;
      doc.setFont("helvetica", "bold");
      return n > 1 ? Math.max(30, n * 11 + 8) : 22;
    }
    return 24; // dois-campos
  });
  const somaRight = alturas.reduce((a, b) => a + b, 0);
  if (somaRight < alturaTotal) {
    // Distribui o excedente igualmente entre as linhas.
    const extra = (alturaTotal - somaRight) / alturas.length;
    for (let i = 0; i < alturas.length; i += 1) alturas[i] += extra;
  } else if (somaRight > alturaTotal) {
    const fator = alturaTotal / somaRight;
    for (let i = 0; i < alturas.length; i += 1) alturas[i] *= fator;
  }

  // ————— Coluna esquerda: 5 logos, shrink-to-fit dentro da altura fixa —————
  const logosValidos = logos.filter((l): l is LogoInstitucional => Boolean(l));
  const gapLogos = 6;
  const larguraSlot = leftW * 0.75;
  const naturalHs = logosValidos.map((l) => larguraSlot * (l.h / l.w));
  const somaNatural = naturalHs.reduce((a, b) => a + b, 0);
  const gapsTotal = gapLogos * (logosValidos.length + 1);
  const disponivelLogos = alturaTotal - gapsTotal;
  const escala =
    somaNatural > 0 && somaNatural > disponivelLogos ? disponivelLogos / somaNatural : 1;
  const alturasLogos = naturalHs.map((h) => h * escala);

  // ————— Coluna esquerda: caixa única com logos empilhados —————
  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.rect(marginX, yStart, leftW, alturaTotal);

  if (logosValidos.length > 0) {
    const totalLogosH = alturasLogos.reduce((a, b) => a + b, 0);
    const gapEfetivo = (alturaTotal - totalLogosH) / (logosValidos.length + 1);
    let yLogo = yStart + gapEfetivo;
    logosValidos.forEach((logo, i) => {
      const hw = larguraSlot;
      const hh = alturasLogos[i];
      const lx = marginX + (leftW - hw) / 2;
      try {
        doc.addImage(logo.dataUrl, logo.format, lx, yLogo, hw, hh);
      } catch {
        /* ignora imagem que falhe no addImage */
      }
      yLogo += hh + gapEfetivo;
    });
  }

  // ————— Coluna direita: linhas empilhadas —————
  let y = yStart;
  linhas.forEach((linha, idx) => {
    const h = alturas[idx];
    doc.setDrawColor(0);
    doc.setLineWidth(0.6);

    if (linha.tipo === "titulo") {
      doc.rect(rightX, y, rightW, h);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10.5);
      const linhasTxt = doc.splitTextToSize(linha.texto, rightW - 12) as string[];
      const lh = 13;
      const bloco = linhasTxt.length * lh;
      const startY = y + (h - bloco) / 2 + lh - 3;
      linhasTxt.forEach((p, j) => {
        doc.text(p, rightX + rightW / 2, startY + j * lh, { align: "center" });
      });
    } else if (linha.tipo === "subtitulo") {
      doc.rect(rightX, y, rightW, h);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8.5);
      const linhasTxt = doc.splitTextToSize(linha.texto, rightW - 12) as string[];
      const lh = 10;
      const bloco = linhasTxt.length * lh;
      const startY = y + (h - bloco) / 2 + lh - 3;
      linhasTxt.forEach((p, j) => {
        doc.text(p, rightX + rightW / 2, startY + j * lh, { align: "center" });
      });
    } else if (linha.tipo === "campo") {
      doc.rect(rightX, y, rightW, h);
      desenharCampo(doc, rightX, y, rightW, h, linha.label, linha.valor, linha.sublinhar);
    } else {
      const meia = rightW / 2;
      doc.rect(rightX, y, meia, h);
      doc.rect(rightX + meia, y, rightW - meia, h);
      desenharCampo(doc, rightX, y, meia, h, linha.a.label, linha.a.valor, linha.a.sublinhar);
      desenharCampo(
        doc,
        rightX + meia,
        y,
        rightW - meia,
        h,
        linha.b.label,
        linha.b.valor,
        linha.b.sublinhar,
      );
    }
    y += h;
  });

  return yStart + alturaTotal;
}

function desenharCampo(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  valor: string,
  sublinhar?: boolean,
) {
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const baseY = y + h / 2 + 3;
  doc.text(label, x + 6, baseY);
  const labelW = doc.getTextWidth(label) + 6;
  doc.setFont("helvetica", "normal");
  const valorX = x + 6 + labelW;
  const maxValorW = w - labelW - 12;
  const valorTxt = String(valor ?? "");
  if (valorTxt) {
    // Sequências de underscore ("_____") como placeholder devem caber
    // exatamente na célula — jsPDF não quebra "_" com maxWidth, e o traço
    // vazava para fora do quadro. Recalculamos quantos "_" cabem.
    if (/^[_\s]+$/.test(valorTxt)) {
      const oneW = Math.max(doc.getTextWidth("_"), 0.1);
      const count = Math.max(1, Math.floor(maxValorW / oneW));
      doc.text("_".repeat(count), valorX, baseY);
    } else {
      doc.text(valorTxt, valorX, baseY, { maxWidth: maxValorW });
      if (sublinhar) {
        const larg = Math.min(doc.getTextWidth(valorTxt), maxValorW);
        doc.setLineWidth(0.4);
        doc.line(valorX, baseY + 1.5, valorX + larg, baseY + 1.5);
      }
    }
  }
}