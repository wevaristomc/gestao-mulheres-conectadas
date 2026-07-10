import { jsPDF } from "jspdf";

// Modelos oficiais DEQ/PMQ — fidelidade exata ao docx original.
//   1) Lista Comprobatória de Entregas aos Cursistas (kits/EPI/camisetas).
//   2) Lista de Entrega dos Benefícios — Alimentação e Transporte.
//   3) Lista de Entrega dos Certificados de Conclusão.

export type CursistaEntrega = { nome: string; cpf: string | null };

export type CabecalhoEntrega = {
  entidade: string | null;
  local: string | null;
  turma: string | null;
  responsavelNome?: string | null;
  responsavelCPF?: string | null;
  data?: string | null; // ISO
  horario?: string | null; // "HH:MM"
};

export type TipoKit =
  | "kit_aluno"
  | "material_pedagogico"
  | "kit_profissional"
  | "epi"
  | "camisetas";

export const TIPOS_KIT_LABEL: Record<TipoKit, string> = {
  kit_aluno: "Kit aluno",
  material_pedagogico: "material pedagógico",
  kit_profissional: "Kit profissional _quando aplicável",
  epi: "Equipamento de Proteção Individual-EPI _quando aplicável",
  camisetas: "camisetas",
};

const AZUL: [number, number, number] = [27, 42, 74];
const LINHAS_POR_PAGINA = 25;

function fCPF(cpf: string | null): string {
  if (!cpf) return "";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fDataBR(iso: string | null | undefined): { d: string; m: string; y: string } {
  if (!iso) return { d: "___", m: "___", y: "______" };
  const dt = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return { d: "___", m: "___", y: "______" };
  return {
    d: String(dt.getDate()).padStart(2, "0"),
    m: String(dt.getMonth() + 1).padStart(2, "0"),
    y: String(dt.getFullYear()),
  };
}

function ordenar(rows: CursistaEntrega[]): CursistaEntrega[] {
  return [...rows].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );
}

function paginar(cursistas: CursistaEntrega[]): CursistaEntrega[][] {
  const rows = [...cursistas];
  const total = Math.max(rows.length, LINHAS_POR_PAGINA);
  const paginas: CursistaEntrega[][] = [];
  for (let i = 0; i < total; i += LINHAS_POR_PAGINA) {
    const slice = rows.slice(i, i + LINHAS_POR_PAGINA);
    while (slice.length < LINHAS_POR_PAGINA) slice.push({ nome: "", cpf: null });
    paginas.push(slice);
  }
  return paginas;
}

// ————————————— Cabeçalho comum (título + subtítulo + campos) ——————————

function tituloBloco(
  doc: jsPDF,
  W: number,
  y: number,
  titulo: string,
  subtitulo: string,
  marginX: number,
): number {
  doc.setFillColor(...AZUL);
  doc.rect(marginX, y, W - marginX * 2, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10.5);
  doc.text(titulo, W / 2, y + 15, { align: "center", maxWidth: W - marginX * 2 - 20 });
  let y2 = y + 22;
  doc.setTextColor(...AZUL);
  doc.setFontSize(8.5);
  doc.rect(marginX, y2, W - marginX * 2, 16);
  doc.text(subtitulo, W / 2, y2 + 11, { align: "center" });
  return y2 + 16;
}

function metadadosBloco(
  doc: jsPDF,
  W: number,
  yStart: number,
  marginX: number,
  cab: CabecalhoEntrega,
  extraLinha?: [string, string],
): number {
  const entidade = (cab.entidade ?? "QUINTA ARTE").toUpperCase();
  const respNome = cab.responsavelNome ?? "____________________________________";
  const respCPF = cab.responsavelCPF ?? "____________________";
  const { d, m, y } = fDataBR(cab.data ?? null);
  const [hh, mm] = (cab.horario ?? "").split(":");
  const hhTxt = hh ?? "___";
  const mmTxt = mm ?? "___";

  const campos: [string, string][] = [
    ["Nome da Entidade Executora:", entidade],
    ["Local de Realização da Qualificação:", cab.local ?? ""],
    ["Identificação da Turma:", cab.turma ?? ""],
    ["Responsável pela Entrega:", `${respNome}   CPF: ${respCPF}`],
    ["Data:", `${d}/${m}/${y}   —   Horário: ${hhTxt}:${mmTxt}`],
  ];
  if (extraLinha) campos.push(extraLinha);

  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  let y1 = yStart;
  const linhaAlt = 16;
  campos.forEach(([label, valor]) => {
    doc.rect(marginX, y1, W - marginX * 2, linhaAlt);
    doc.setFont("helvetica", "bold");
    doc.text(label, marginX + 6, y1 + 11);
    doc.setFont("helvetica", "normal");
    const labelW = doc.getTextWidth(label) + 10;
    doc.text(String(valor).slice(0, 200), marginX + 6 + labelW, y1 + 11, {
      maxWidth: W - marginX * 2 - labelW - 12,
    });
    y1 += linhaAlt;
  });
  return y1;
}

// ————————————— (1) Lista Comprobatória — Kits/EPI/Camisetas ——————————

export function gerarListaEntregaKitPDF(input: {
  cabecalho: CabecalhoEntrega;
  cursistas: CursistaEntrega[];
  tipoSelecionado: TipoKit;
  instrutorNome?: string | null;
}): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const marginX = 28;

  const paginas = paginar(ordenar(input.cursistas));
  paginas.forEach((linhas, pi) => {
    if (pi > 0) doc.addPage();
    let y = 34;
    y = tituloBloco(
      doc,
      W,
      y,
      "LISTA COMPROBATÓRIA DE ENTREGAS AOS CURSISTAS (kit aluno, material pedagógico, kit profissional, EPI, camisetas)",
      "Programa Manuel Querino de Qualificação Social e Profissional-PMQ/DEQ/SEMP/MTE",
      marginX,
    );
    y = metadadosBloco(doc, W, y, marginX, input.cabecalho);

    // Bloco de detalhamento com checkboxes
    const boxH = 52;
    doc.rect(marginX, y, W - marginX * 2, boxH);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(45, 45, 45);
    doc.text(
      "CADA LISTA DEVERÁ TRAZER NESTE ESPAÇO O DETALHAMENTO DO QUE ESTÁ SENDO ENTREGUE / Cada item destes deve ter uma lista específica:",
      marginX + 6,
      y + 10,
      { maxWidth: W - marginX * 2 - 12 },
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const itensOrdem: TipoKit[] = [
      "kit_aluno",
      "material_pedagogico",
      "kit_profissional",
      "epi",
      "camisetas",
    ];
    let cx = marginX + 8;
    const cy = y + 34;
    itensOrdem.forEach((k, idx) => {
      const label = `${idx + 1}. ${TIPOS_KIT_LABEL[k]}`;
      doc.text(label, cx, cy);
      const labW = doc.getTextWidth(label);
      // checkbox
      doc.rect(cx + labW + 4, cy - 7, 8, 8);
      if (k === input.tipoSelecionado) {
        doc.setFont("helvetica", "bold");
        doc.text("X", cx + labW + 5.6, cy);
        doc.setFont("helvetica", "normal");
      }
      cx += labW + 22;
      if (cx > W - marginX - 100 && idx < itensOrdem.length - 1) {
        cx = marginX + 8;
        // Next row would overflow: keep on same row via smaller font would be worse — accept overflow safely.
      }
    });
    y += boxH + 4;

    // Tabela: Nº | Nome | CPF | Assinatura
    y = tabelaCursistas(doc, W, H, y, marginX, linhas, pi, [
      { label: "Nº", w: 26, align: "center" },
      { label: "NOME COMPLETO DO/A CURSISTA (digitalizado)", w: 240, align: "left" },
      { label: "CPF (digitalizado)", w: 100, align: "center" },
      { label: "ASSINATURA DO/A CURSISTA", w: 0, align: "left" },
    ]);

    rodapeAssinatura(
      doc,
      W,
      H,
      marginX,
      "ASSINATURA DO/A INSTRUTOR/A:",
      input.instrutorNome ?? null,
      pi + 1,
      paginas.length,
    );
  });

  return doc.output("blob");
}

// ————————————— (2) Lista de Entrega — Benefícios (Transporte/Alimentação) ————

export function gerarListaEntregaBeneficiosPDF(input: {
  cabecalho: CabecalhoEntrega;
  cursistas: CursistaEntrega[];
}): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const marginX = 28;

  const paginas = paginar(ordenar(input.cursistas));
  paginas.forEach((linhas, pi) => {
    if (pi > 0) doc.addPage();
    let y = 34;
    y = tituloBloco(
      doc,
      W,
      y,
      "LISTA DE ENTREGA DOS BENEFÍCIOS - ALIMENTAÇÃO E TRANSPORTE",
      "Programa Manuel Querino de Qualificação Social e Profissional-PMQ/DEQ/SEMP/MTE",
      marginX,
    );
    y = metadadosBloco(doc, W, y, marginX, input.cabecalho);

    // Parágrafo normativo (literal — Instrução Normativa SGER nº 9/2024)
    const paragrafo =
      "A concessão de auxílio-transporte e auxílio-alimentação poderá ser realizada por meio de transferência bancária, ou qualquer outro meio de pagamento eletrônico, como previsto no Plano de Trabalho e desde que identificado, com o nome e CPF do qualificando matriculado e frequente em curso de qualificação social e profissional, no âmbito do Programa Manoel Querino - PMQ, neste caso a comprovação das entregas se dará por meio de Relatório Bancário, como indicado pela Instrução Normativa SGER nº 9/2024.";
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(45, 45, 45);
    const linhasTxt = doc.splitTextToSize(paragrafo, W - marginX * 2 - 12);
    const paragH = linhasTxt.length * 10 + 10;
    doc.rect(marginX, y, W - marginX * 2, paragH);
    doc.text(linhasTxt, marginX + 6, y + 12, { lineHeightFactor: 1.35 });
    y += paragH + 4;

    y = tabelaCursistas(doc, W, H, y, marginX, linhas, pi, [
      { label: "Nº", w: 26, align: "center" },
      { label: "NOME COMPLETO DO/A CURSISTA (digitalizado)", w: 170, align: "left" },
      { label: "CPF (digitalizado)", w: 88, align: "center" },
      { label: "Auxílio Transporte", w: 74, align: "center" },
      {
        label: "Auxílio Alimentação\n(quando não for diário)",
        w: 88,
        align: "center",
      },
      { label: "ASSINATURA DO/A CURSISTA", w: 0, align: "left" },
    ]);

    rodapeAssinatura(
      doc,
      W,
      H,
      marginX,
      "ASSINATURA DO/A RESPONSÁVEL PELA ENTREGA:",
      input.cabecalho.responsavelNome ?? null,
      pi + 1,
      paginas.length,
    );
  });

  return doc.output("blob");
}

// ————————————— (3) Lista de Entrega — Certificados ————————————————————

export function gerarListaEntregaCertificadosPDF(input: {
  cabecalho: CabecalhoEntrega;
  cursistas: CursistaEntrega[];
}): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const marginX = 28;

  const paginas = paginar(ordenar(input.cursistas));
  paginas.forEach((linhas, pi) => {
    if (pi > 0) doc.addPage();
    let y = 34;
    y = tituloBloco(
      doc,
      W,
      y,
      "LISTA DE ENTREGA DOS CERTIFICADOS DE CONCLUSÃO DE CURSO DOS CONCLUINTES",
      "Programa Manuel Querino de Qualificação Social e Profissional-PMQ/DEQ/SEMP/MTE",
      marginX,
    );
    y = metadadosBloco(doc, W, y, marginX, input.cabecalho);

    y = tabelaCursistas(doc, W, H, y, marginX, linhas, pi, [
      { label: "Nº", w: 26, align: "center" },
      { label: "NOME COMPLETO DO/A CURSISTA (digitado)", w: 240, align: "left" },
      { label: "CPF (digitado)", w: 100, align: "center" },
      { label: "ASSINATURA DO/A CONCLUINTE", w: 0, align: "left" },
    ]);

    rodapeAssinatura(
      doc,
      W,
      H,
      marginX,
      "ASSINATURA DO/A RESPONSÁVEL:",
      input.cabecalho.responsavelNome ?? null,
      pi + 1,
      paginas.length,
    );
  });

  return doc.output("blob");
}

// ————————————— Helpers de tabela ——————————————————————————————————

type ColDef = { label: string; w: number; align: "center" | "left" };

function tabelaCursistas(
  doc: jsPDF,
  W: number,
  H: number,
  yStart: number,
  marginX: number,
  linhas: CursistaEntrega[],
  paginaIdx: number,
  cols: ColDef[],
): number {
  const tableX = marginX;
  const tableW = W - marginX * 2;
  // Coluna com w=0 = expande para o restante.
  const totalFixo = cols.reduce((s, c) => s + c.w, 0);
  const flexIdx = cols.findIndex((c) => c.w === 0);
  const flexW = flexIdx >= 0 ? tableW - totalFixo : 0;
  const ws = cols.map((c, i) => (i === flexIdx ? flexW : c.w));
  const xs: number[] = [tableX];
  ws.forEach((w) => xs.push(xs[xs.length - 1] + w));

  const headerH = 30;
  doc.setFillColor(...AZUL);
  doc.rect(tableX, yStart, tableW, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  cols.forEach((c, i) => {
    const cx = xs[i] + (xs[i + 1] - xs[i]) / 2;
    const partes = c.label.split("\n");
    partes.forEach((p, j) => {
      doc.text(p, cx, yStart + 12 + j * 9, { align: "center" });
    });
  });
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  for (let i = 1; i < xs.length - 1; i += 1) {
    doc.line(xs[i], yStart, xs[i], yStart + headerH);
  }
  let y = yStart + headerH;

  const disponivel = H - y - 70;
  const rowH = Math.max(18, Math.min(24, Math.floor(disponivel / linhas.length)));

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.4);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const numeroInicial = paginaIdx * LINHAS_POR_PAGINA + 1;
  linhas.forEach((c, i) => {
    const rowY = y + i * rowH;
    doc.rect(tableX, rowY, tableW, rowH);
    for (let j = 1; j < xs.length - 1; j += 1) {
      doc.line(xs[j], rowY, xs[j], rowY + rowH);
    }
    const numero = String(numeroInicial + i).padStart(2, "0");
    doc.text(numero, xs[0] + ws[0] / 2, rowY + rowH / 2 + 3, { align: "center" });
    if (c.nome) {
      doc.text(c.nome.slice(0, 44), xs[1] + 4, rowY + rowH / 2 + 3);
    }
    if (c.cpf) {
      const cxCpf = xs[2] + ws[2] / 2;
      doc.text(fCPF(c.cpf), cxCpf, rowY + rowH / 2 + 3, { align: "center" });
    }
  });
  return y + rowH * linhas.length;
}

function rodapeAssinatura(
  doc: jsPDF,
  W: number,
  H: number,
  marginX: number,
  label: string,
  nome: string | null,
  paginaLista: number,
  totalPaginasLista: number,
) {
  const yy = H - 46;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(label, marginX, yy);
  const w = doc.getTextWidth(label) + 8;
  doc.setLineWidth(0.6);
  doc.line(marginX + w, yy + 2, W - marginX, yy + 2);
  if (nome) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(nome, marginX + w + 6, yy - 2);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  if (totalPaginasLista > 1) {
    doc.text(`Folha ${paginaLista}/${totalPaginasLista}`, W - marginX, H - 16, {
      align: "right",
    });
  }
}

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