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
  const leftW = Math.round(usableW * 0.22);
  const rightX = marginX + leftW;
  const rightW = usableW - leftW;

  // Pré-cálculo de alturas do lado direito.
  doc.setFont("helvetica", "bold");
  const alturas = linhas.map((l) => {
    if (l.tipo === "titulo") {
      doc.setFontSize(10.5);
      const linhasTxt = doc.splitTextToSize(l.texto, rightW - 12) as string[];
      return Math.max(24, linhasTxt.length * 13 + 6);
    }
    if (l.tipo === "subtitulo") {
      doc.setFontSize(8.5);
      const linhasTxt = doc.splitTextToSize(l.texto, rightW - 12) as string[];
      return Math.max(16, linhasTxt.length * 10 + 4);
    }
    return 16;
  });
  const alturaTotal = alturas.reduce((a, b) => a + b, 0);

  // ————— Coluna esquerda: caixa única com logos empilhados —————
  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.rect(marginX, yStart, leftW, alturaTotal);

  const logosValidos = logos.filter((l): l is LogoInstitucional => Boolean(l));
  if (logosValidos.length > 0) {
    const gap = 4;
    const padX = 4;
    const alturaSlot = (alturaTotal - gap * (logosValidos.length + 1)) / logosValidos.length;
    const larguraSlot = leftW - padX * 2;
    let yLogo = yStart + gap;
    logosValidos.forEach((logo) => {
      const aspect = logo.w / logo.h;
      let hw = larguraSlot;
      let hh = hw / aspect;
      if (hh > alturaSlot) {
        hh = alturaSlot;
        hw = hh * aspect;
      }
      const lx = marginX + (leftW - hw) / 2;
      const ly = yLogo + (alturaSlot - hh) / 2;
      try {
        doc.addImage(logo.dataUrl, logo.format, lx, ly, hw, hh);
      } catch {
        /* ignora imagem que falhe no addImage */
      }
      yLogo += alturaSlot + gap;
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
    doc.text(valorTxt, valorX, baseY, { maxWidth: maxValorW });
    if (sublinhar) {
      const larg = Math.min(doc.getTextWidth(valorTxt), maxValorW);
      doc.setLineWidth(0.4);
      doc.line(valorX, baseY + 1.5, valorX + larg, baseY + 1.5);
    }
  }
}