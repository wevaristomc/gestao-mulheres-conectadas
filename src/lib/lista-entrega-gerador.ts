import { jsPDF } from "jspdf";
import {
  carregarLogosInstitucionais,
  renderCabecalhoInstitucional,
  type LinhaCabecalho,
  type LogoInstitucional,
} from "./cabecalho-institucional";
import { formatarCPF } from "@/lib/cpf";
import { parseISODateLocal } from "@/lib/date-utils";

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

// Ritmo de folhas replicando o documento oficial escaneado — mesmo padrão
// da lista de frequência: primeira folha tem cabeçalho institucional +
// bloco específico + 25 linhas. Folhas de continuação recomeçam a tabela
// direto do topo (sem cabeçalho e sem cabeçalho de colunas), com 40 linhas.
// A última folha (que também é continuação, ou a única quando cabe tudo)
// reserva espaço para a caixa de assinatura no rodapé — 33 linhas.
const LINHAS_PRIMEIRA = 25;
const LINHAS_CONTINUACAO = 40;
const LINHAS_ULTIMA = 33;

type FolhaEntrega = { linhas: CursistaEntrega[]; tipo: "primeira" | "continuacao" | "ultima" };

// Fontes únicas — @/lib/cpf e @/lib/date-utils (auditoria P1/P5).
function fCPF(cpf: string | null): string {
  return formatarCPF(cpf ?? "");
}
function fDataBR(iso: string | null | undefined): { d: string; m: string; y: string } {
  const dt = parseISODateLocal(iso ?? null);
  if (!dt) return { d: "___", m: "___", y: "______" };
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

function paginar(cursistas: CursistaEntrega[]): FolhaEntrega[] {
  const rows = [...cursistas];
  const preenche = (arr: CursistaEntrega[], n: number) => {
    while (arr.length < n) arr.push({ nome: "", cpf: null });
    return arr;
  };
  if (rows.length <= LINHAS_PRIMEIRA) {
    return [{ linhas: preenche(rows.slice(0, LINHAS_PRIMEIRA), LINHAS_PRIMEIRA), tipo: "primeira" }];
  }
  const folhas: FolhaEntrega[] = [];
  folhas.push({ linhas: preenche(rows.slice(0, LINHAS_PRIMEIRA), LINHAS_PRIMEIRA), tipo: "primeira" });
  let i = LINHAS_PRIMEIRA;
  while (rows.length - i > LINHAS_ULTIMA) {
    const slice = rows.slice(i, i + LINHAS_CONTINUACAO);
    preenche(slice, LINHAS_CONTINUACAO);
    folhas.push({ linhas: slice, tipo: "continuacao" });
    i += LINHAS_CONTINUACAO;
  }
  const ultima = rows.slice(i);
  preenche(ultima, LINHAS_ULTIMA);
  folhas.push({ linhas: ultima, tipo: "ultima" });
  return folhas;
}

function numeroInicialContinuacao(paginaIdx: number): number {
  // paginaIdx=0 → 1; paginaIdx=1 → 26; depois +40 por folha.
  if (paginaIdx === 0) return 1;
  return LINHAS_PRIMEIRA + (paginaIdx - 1) * LINHAS_CONTINUACAO + 1;
}

// ————————————— Cabeçalho comum ——————————————————————————————————————

function montarLinhasCabecalho(
  cab: CabecalhoEntrega,
  titulo: string,
  extra?: LinhaCabecalho[],
): LinhaCabecalho[] {
  const entidade = (cab.entidade ?? "QUINTA ARTE").toUpperCase();
  const respNome = cab.responsavelNome ?? "____________________________________";
  const respCPF = cab.responsavelCPF ?? "____________________";
  const { d, m, y } = fDataBR(cab.data ?? null);
  const [hh, mm] = (cab.horario ?? "").split(":");
  const hhTxt = hh ?? "___";
  const mmTxt = mm ?? "___";
  const linhas: LinhaCabecalho[] = [
    { tipo: "titulo", texto: titulo },
    {
      tipo: "subtitulo",
      texto: "Programa Manuel Querino de Qualificação Social e Profissional-PMQ/DEQ/SEMP/MTE",
    },
    { tipo: "campo", label: "Nome da Entidade Executora:", valor: entidade },
    { tipo: "campo", label: "Local de Realização da Qualificação:", valor: cab.local ?? "" },
    { tipo: "campo", label: "Identificação da Turma:", valor: cab.turma ?? "" },
    {
      tipo: "dois-campos",
      a: { label: "Responsável pela Entrega:", valor: respNome, sublinhar: Boolean(cab.responsavelNome) },
      b: { label: "CPF:", valor: respCPF, sublinhar: Boolean(cab.responsavelCPF) },
    },
    {
      tipo: "dois-campos",
      a: { label: "Data:", valor: `${d}/${m}/${y}`, sublinhar: Boolean(cab.data) },
      b: { label: "Horário:", valor: `${hhTxt}:${mmTxt}`, sublinhar: Boolean(cab.horario) },
    },
  ];
  if (extra) linhas.push(...extra);
  return linhas;
}

// ————————————— (1) Lista Comprobatória — Kits/EPI/Camisetas ——————————

export async function gerarListaEntregaKitPDF(input: {
  cabecalho: CabecalhoEntrega;
  cursistas: CursistaEntrega[];
  tipoSelecionado: TipoKit;
  instrutorNome?: string | null;
}): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const marginX = 28;

  const logos = await carregarLogosInstitucionais();
  const paginas = paginar(ordenar(input.cursistas));
  const colsKit: ColDef[] = [
    { label: "Nº", w: 26, align: "center" },
    { label: "NOME COMPLETO DO/A CURSISTA (digitalizado)", w: 240, align: "left" },
    { label: "CPF (digitalizado)", w: 100, align: "center" },
    { label: "ASSINATURA DO/A CURSISTA", w: 0, align: "left" },
  ];
  paginas.forEach((folha, pi) => {
    if (pi > 0) doc.addPage();
    const ehUltima = pi === paginas.length - 1;
    let y = 34;
    if (folha.tipo === "primeira") {
      const linhasCab = montarLinhasCabecalho(
        input.cabecalho,
        "LISTA COMPROBATÓRIA DE ENTREGAS AOS CURSISTAS (kit aluno, material pedagógico, kit profissional, EPI, camisetas)",
      );
      y = renderCabecalhoInstitucional(doc, { W, marginX, yStart: y, linhas: linhasCab, logos });
      y += 4;

      // Bloco de detalhamento com checkboxes (só na primeira folha)
    const boxH = 52;
    doc.setDrawColor(0);
    doc.setLineWidth(0.6);
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
    }

    // Tabela: Nº | Nome | CPF | Assinatura
    y = tabelaCursistas(doc, W, H, y, marginX, folha.linhas, pi, colsKit, folha.tipo === "primeira", ehUltima);
    if (ehUltima) {
      caixaAssinaturaFinal(doc, W, H, marginX, "ASSINATURA DO/A INSTRUTOR/A:", input.instrutorNome ?? null);
    }
    rodapeControle(doc, W, H, marginX, pi + 1, paginas.length);
  });

  return doc.output("blob");
}

// ————————————— (2) Lista de Entrega — Benefícios (Transporte/Alimentação) ————

export async function gerarListaEntregaBeneficiosPDF(input: {
  cabecalho: CabecalhoEntrega;
  cursistas: CursistaEntrega[];
}): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const marginX = 28;

  const logos = await carregarLogosInstitucionais();
  const paginas = paginar(ordenar(input.cursistas));
  const colsBen: ColDef[] = [
    { label: "Nº", w: 26, align: "center" },
    { label: "NOME COMPLETO DO/A CURSISTA (digitalizado)", w: 170, align: "left" },
    { label: "CPF (digitalizado)", w: 88, align: "center" },
    { label: "Auxílio Transporte", w: 74, align: "center" },
    { label: "Auxílio Alimentação\n(quando não for diário)", w: 88, align: "center" },
    { label: "ASSINATURA DO/A CURSISTA", w: 0, align: "left" },
  ];
  paginas.forEach((folha, pi) => {
    if (pi > 0) doc.addPage();
    const ehUltima = pi === paginas.length - 1;
    let y = 34;
    if (folha.tipo === "primeira") {
      const linhasCab = montarLinhasCabecalho(
        input.cabecalho,
        "LISTA DE ENTREGA DOS BENEFÍCIOS - ALIMENTAÇÃO E TRANSPORTE",
      );
      y = renderCabecalhoInstitucional(doc, { W, marginX, yStart: y, linhas: linhasCab, logos });
      y += 4;

    // Parágrafo normativo (literal — Instrução Normativa SGER nº 9/2024)
    const paragrafo =
      "A concessão de auxílio-transporte e auxílio-alimentação poderá ser realizada por meio de transferência bancária, ou qualquer outro meio de pagamento eletrônico, como previsto no Plano de Trabalho e desde que identificado, com o nome e CPF do qualificando matriculado e frequente em curso de qualificação social e profissional, no âmbito do Programa Manoel Querino - PMQ, neste caso a comprovação das entregas se dará por meio de Relatório Bancário, como indicado pela Instrução Normativa SGER nº 9/2024.";
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(45, 45, 45);
    const linhasTxt = doc.splitTextToSize(paragrafo, W - marginX * 2 - 12);
    const paragH = linhasTxt.length * 10 + 10;
    doc.setDrawColor(0);
    doc.setLineWidth(0.6);
    doc.rect(marginX, y, W - marginX * 2, paragH);
    doc.text(linhasTxt, marginX + 6, y + 12, { lineHeightFactor: 1.35 });
    y += paragH + 4;
    }

    y = tabelaCursistas(doc, W, H, y, marginX, folha.linhas, pi, colsBen, folha.tipo === "primeira", ehUltima);
    if (ehUltima) {
      caixaAssinaturaFinal(doc, W, H, marginX, "ASSINATURA DO/A RESPONSÁVEL PELA ENTREGA:", input.cabecalho.responsavelNome ?? null);
    }
    rodapeControle(doc, W, H, marginX, pi + 1, paginas.length);
  });

  return doc.output("blob");
}

// ————————————— (3) Lista de Entrega — Certificados ————————————————————

export async function gerarListaEntregaCertificadosPDF(input: {
  cabecalho: CabecalhoEntrega;
  cursistas: CursistaEntrega[];
}): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const marginX = 28;

  const logos = await carregarLogosInstitucionais();
  const paginas = paginar(ordenar(input.cursistas));
  const colsCert: ColDef[] = [
    { label: "Nº", w: 26, align: "center" },
    { label: "NOME COMPLETO DO/A CURSISTA (digitado)", w: 240, align: "left" },
    { label: "CPF (digitado)", w: 100, align: "center" },
    { label: "ASSINATURA DO/A CONCLUINTE", w: 0, align: "left" },
  ];
  paginas.forEach((folha, pi) => {
    if (pi > 0) doc.addPage();
    const ehUltima = pi === paginas.length - 1;
    let y = 34;
    if (folha.tipo === "primeira") {
      const linhasCab = montarLinhasCabecalho(
        input.cabecalho,
        "LISTA DE ENTREGA DOS CERTIFICADOS DE CONCLUSÃO DE CURSO DOS CONCLUINTES",
      );
      y = renderCabecalhoInstitucional(doc, { W, marginX, yStart: y, linhas: linhasCab, logos });
      y += 4;
    }

    y = tabelaCursistas(doc, W, H, y, marginX, folha.linhas, pi, colsCert, folha.tipo === "primeira", ehUltima);
    if (ehUltima) {
      caixaAssinaturaFinal(doc, W, H, marginX, "ASSINATURA DO/A RESPONSÁVEL:", input.cabecalho.responsavelNome ?? null);
    }
    rodapeControle(doc, W, H, marginX, pi + 1, paginas.length);
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
  renderHeader: boolean,
  ehUltima: boolean,
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

  let y = yStart;
  if (renderHeader) {
    const headerH = 30;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.rect(tableX, y, tableW, headerH);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    cols.forEach((c, i) => {
      const cx = xs[i] + (xs[i + 1] - xs[i]) / 2;
      const partes = c.label.split("\n");
      partes.forEach((p, j) => {
        doc.text(p, cx, y + 12 + j * 9, { align: "center" });
      });
    });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    for (let i = 1; i < xs.length - 1; i += 1) {
      doc.line(xs[i], y, xs[i], y + headerH);
    }
    y += headerH;
  }

  // Reserva rodapé: última folha precisa de caixa de assinatura + rodapé;
  // demais folhas só do rodapé de controle.
  const reservaRodape = ehUltima ? 70 : 26;
  const disponivel = H - y - reservaRodape;
  const rowH = Math.max(18, Math.min(24, Math.floor(disponivel / linhas.length)));

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const numeroInicial = numeroInicialContinuacao(paginaIdx);
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

// Caixa de assinatura no rodapé da última folha (dentro de um quadro,
// imitando o documento oficial).
function caixaAssinaturaFinal(
  doc: jsPDF,
  W: number,
  H: number,
  marginX: number,
  label: string,
  nome: string | null,
) {
  const w = W - marginX * 2;
  const h = 42;
  const y = H - 26 - h;
  doc.setDrawColor(0);
  doc.setLineWidth(0.6);
  doc.rect(marginX, y, w, h);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(label, marginX + 8, y + h / 2 + 3);
  const labW = doc.getTextWidth(label);
  doc.setLineWidth(0.4);
  doc.line(marginX + 8 + labW + 8, y + h / 2 + 5, marginX + w - 8, y + h / 2 + 5);
  if (nome) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(nome, marginX + 8 + labW + 12, y + h / 2 + 1);
  }
}

// Rodapé de controle interno (cinza, 7pt) — impresso em todas as folhas.
function rodapeControle(
  doc: jsPDF,
  W: number,
  H: number,
  marginX: number,
  paginaLista: number,
  totalPaginasLista: number,
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  if (totalPaginasLista > 1) {
    doc.text(`Folha ${paginaLista}/${totalPaginasLista}`, W - marginX, H - 12, { align: "right" });
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