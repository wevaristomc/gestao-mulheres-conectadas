import { jsPDF } from "jspdf";
import type { RelacaoHoras, RelacaoItem, TurmaVinculo } from "./relacao-horas-queries";
import { classificarTurno } from "./relacao-horas-queries";
import { parseISODateLocal } from "@/lib/date-utils";

const CINZA_H: [number, number, number] = [220, 220, 220];
const CINZA_B: [number, number, number] = [160, 160, 160];
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
  const dt = parseISODateLocal(iso);
  if (!dt) return iso;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
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
function hm(t: string | null | undefined): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function chDaTurma(t: TurmaVinculo): number {
  if (!t.hora_inicio || !t.hora_fim) return 0;
  const [ah, am] = t.hora_inicio.split(":").map(Number);
  const [bh, bm] = t.hora_fim.split(":").map(Number);
  return Math.max(0, bh * 60 + bm - ah * 60 - am) / 60;
}

export function gerarPdfRelacaoHoras(input: {
  relacao: RelacaoHoras;
  itens: RelacaoItem[];
  professorNome: string;
  professorEmail?: string;
  turmas?: TurmaVinculo[];
}): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 30;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(
    `RELAÇÃO DE HORAS - ${mesExtenso(input.relacao.mes_referencia)}`,
    pageW / 2,
    margin + 8,
    { align: "center" },
  );

  // Cabeçalho em 2 colunas
  let y = margin + 30;
  const colW = (pageW - margin * 2) / 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);

  const par = (lab: string, val: string, xL: number, yL: number) => {
    doc.setFont("helvetica", "bold");
    doc.text(lab, xL, yL);
    const w = doc.getTextWidth(lab);
    doc.setFont("helvetica", "normal");
    doc.text(val, xL + w + 4, yL);
  };

  const linhas: [string, string, string, string][] = [];
  linhas.push([
    "Professor:",
    input.professorNome,
    "Valor da hora:",
    fmtBRL(Number(input.relacao.valor_hora)),
  ]);

  const turmas = (input.turmas ?? []).slice().sort((a, b) => {
    const ta = classificarTurno(a);
    const tb = classificarTurno(b);
    const ord = { manha: 0, tarde: 1, noite: 2 } as const;
    return ord[ta] - ord[tb];
  });
  const turnoLabel: Record<string, string> = { manha: "manhã", tarde: "tarde", noite: "noite" };
  // Determina locais distintos a partir dos itens (fonte da verdade)
  const itensTrabalhados = input.itens.filter((i) => Number(i.total_horas) > 0);
  const locaisPresentes = Array.from(
    new Set(itensTrabalhados.map((i) => i.local_nome).filter(Boolean) as string[]),
  );
  const multiLocal = locaisPresentes.length > 1;

  // Locais mapeados por nome → município (via turmas)
  const localMun = new Map<string, string | null>();
  for (const t of turmas) {
    if (t.local_nome) localMun.set(t.local_nome, t.local_municipio ?? null);
  }

  if (!multiLocal) {
    const nome = locaisPresentes[0] ?? input.relacao.local_trabalho ?? "—";
    const mun = localMun.get(nome ?? "") ?? null;
    linhas.push([
      "Local:",
      mun ? `${nome} - ${mun}` : nome,
      "Período:",
      mesExtenso(input.relacao.mes_referencia),
    ]);
  } else {
    // Locais: A - munA (manhã) / B - munB (noite)
    const partes: string[] = [];
    for (const t of turmas) {
      if (!t.local_nome) continue;
      const tn = turnoLabel[classificarTurno(t)];
      const mun = t.local_municipio ?? "";
      partes.push(`${t.local_nome}${mun ? " - " + mun : ""} (${tn})`);
    }
    linhas.push([
      "Locais:",
      partes.join(" / ") || locaisPresentes.join(" / "),
      "Período:",
      mesExtenso(input.relacao.mes_referencia),
    ]);
  }

  if (turmas.length === 1) {
    const t = turmas[0];
    linhas.push([
      "Turma:",
      `${t.codigo ?? t.nome ?? "—"} - ${hm(t.hora_inicio)} às ${hm(t.hora_fim)}`,
      "Carga:",
      `${fmtHoras(chDaTurma(t))} horas`,
    ]);
  } else {
    for (const t of turmas) {
      const tn = turnoLabel[classificarTurno(t)];
      linhas.push([
        `Turma da ${tn}:`,
        `${t.codigo ?? t.nome ?? "—"} - ${hm(t.hora_inicio)} às ${hm(t.hora_fim)}`,
        `Carga ${tn}:`,
        `${fmtHoras(chDaTurma(t))} horas`,
      ]);
    }
    if (turmas.length >= 2) {
      const m = turmas[0];
      const t2 = turmas[1];
      const cargaTotal = turmas.reduce((s, x) => s + chDaTurma(x), 0);
      linhas.push([
        "Intervalo:",
        `${hm(m.hora_fim)} às ${hm(t2.hora_inicio)} - 1 hora de almoço não contabilizada`,
        "Carga diária:",
        `${fmtHoras(cargaTotal)} horas`,
      ]);
    }
  }

  for (const [lE, vE, lD, vD] of linhas) {
    par(lE, vE, margin, y);
    par(lD, vD, margin + colW, y);
    y += 14;
  }
  y += 6;

  // Tabela
  const baseCols = [
    { label: "DATA", w: 56 },
    { label: "DIA DA SEMANA", w: 90 },
    ...(multiLocal ? [{ label: "LOCAL", w: 100 }] : []),
    { label: "ENTRADA", w: 58 },
    { label: "SAÍDA ALMOÇO", w: 66 },
    { label: "RETORNO", w: 58 },
    { label: "SAÍDA", w: 55 },
    { label: "HORAS", w: 55 },
    { label: "VALOR DO DIA", w: 78 },
    { label: "CONTEÚDO TRABALHADO", w: 0 },
  ];
  const cols = baseCols;
  const used = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = pageW - margin * 2 - used;

  const rowH = 18;
  const drawHeader = (yStart: number) => {
    doc.setFillColor(...CINZA_H);
    doc.setDrawColor(...CINZA_B);
    doc.rect(margin, yStart, pageW - margin * 2, rowH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0);
    let x = margin;
    cols.forEach((c) => {
      doc.text(c.label, x + c.w / 2, yStart + rowH - 6, { align: "center" });
      x += c.w;
    });
    // linhas verticais
    let xv = margin;
    for (const c of cols) {
      doc.line(xv, yStart, xv, yStart + rowH);
      xv += c.w;
    }
    return yStart + rowH;
  };

  y = drawHeader(y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  // itensTrabalhados já calculado acima

  const drawRow = (item: RelacaoItem) => {
    const dt = new Date(item.data + "T12:00:00");
    const dow = dt.getDay();

    if (y + rowH > pageH - 90) {
      doc.addPage();
      y = margin + 6;
      y = drawHeader(y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }

    doc.setDrawColor(...CINZA_B);
    doc.rect(margin, y, pageW - margin * 2, rowH, "S");
    let xB = margin;
    for (const c of cols) {
      doc.line(xB, y, xB, y + rowH);
      xB += c.w;
    }

    const cells = [
      fmtDataBR(item.data),
      DIAS_SEMANA[dow],
      ...(multiLocal ? [shortLocal(item.local_nome ?? "")] : []),
      hm(item.hora_entrada),
      hm(item.saida_almoco),
      hm(item.retorno),
      hm(item.hora_saida),
      fmtHoras(Number(item.total_horas)),
      fmtBRL(Number(item.valor_dia)),
      item.conteudo ?? "",
    ];
    let x = margin;
    cells.forEach((v, i) => {
      const isConteudo = i === cols.length - 1;
      const align = isConteudo ? "left" : "center";
      const tx = isConteudo ? x + 4 : x + cols[i].w / 2;
      const maxW = cols[i].w - (isConteudo ? 8 : 4);
      const s = doc.splitTextToSize(String(v ?? ""), maxW)[0] ?? "";
      doc.text(s, tx, y + rowH - 6, { align: align as any });
      x += cols[i].w;
    });
    y += rowH;
  };

  itensTrabalhados.forEach(drawRow);

  // Linha total do mês
  if (y + rowH + 60 > pageH - 40) {
    doc.addPage();
    y = margin + 6;
  }
  doc.setFillColor(...CINZA_H);
  doc.setDrawColor(...CINZA_B);
  doc.rect(margin, y, pageW - margin * 2, rowH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  // "TOTAL DO MÊS" ocupa até (mas exclui) a coluna HORAS.
  const horasIdx = cols.findIndex((c) => c.label === "HORAS");
  const wLabel = cols.slice(0, horasIdx).reduce((s, c) => s + c.w, 0);
  doc.text("TOTAL DO MÊS", margin + wLabel / 2, y + rowH - 6, { align: "center" });
  let xt = margin + wLabel;
  const cHoras = cols[horasIdx];
  const cValor = cols[horasIdx + 1];
  const cCont = cols[horasIdx + 2];
  doc.line(xt, y, xt, y + rowH);
  doc.text(fmtHoras(Number(input.relacao.total_horas)), xt + cHoras.w / 2, y + rowH - 6, { align: "center" });
  xt += cHoras.w;
  doc.line(xt, y, xt, y + rowH);
  doc.text(fmtBRL(Number(input.relacao.valor_total)), xt + cValor.w / 2, y + rowH - 6, { align: "center" });
  xt += cValor.w;
  doc.line(xt, y, xt, y + rowH);
  const dias = Number((input.relacao as any).dias_trabalhados ?? itensTrabalhados.length);
  doc.text(`${dias} dias trabalhados`, xt + cCont.w / 2, y + rowH - 6, { align: "center" });
  y += rowH + 12;

  // Observação
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const valorDiaMedio = itensTrabalhados.length
    ? Number(input.relacao.valor_total) / itensTrabalhados.length
    : 0;
  let obs = "";
  if (turmas.length >= 2) {
    const parts = turmas.map((t) => {
      const tn = turnoLabel[classificarTurno(t)];
      return `a turma da ${tn} (${t.codigo ?? t.nome ?? "—"})`;
    });
    obs = `Observação: cada dia contempla ${parts.join(" e ")}, totalizando ${fmtHoras(
      turmas.reduce((s, x) => s + chDaTurma(x), 0),
    )} horas. Valor diário: ${fmtBRL(valorDiaMedio)}.`;
  } else if (turmas.length === 1) {
    obs = `Observação: cada dia contempla a turma ${turmas[0].codigo ?? turmas[0].nome ?? "—"}, com ${fmtHoras(chDaTurma(turmas[0]))} horas. Valor diário: ${fmtBRL(valorDiaMedio)}.`;
  }
  if (obs) {
    const lines = doc.splitTextToSize(obs, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 11 + 8;
  }

  // Rodapé — assinaturas: Professor + 1 linha "Responsável pelo local" por local distinto
  const sigY = Math.max(y + 20, pageH - 90);
  doc.setDrawColor(120);
  const lineW = 200;
  const localsForSig = locaisPresentes.length > 0 ? locaisPresentes : [input.relacao.local_trabalho ?? "—"];
  const slots = [{ label: "Professor", nomeExtra: input.professorNome }]
    .concat(localsForSig.map((n) => ({ label: `Responsável — ${n}`, nomeExtra: "" })));
  const totalW = slots.length * lineW + (slots.length - 1) * 20;
  const startX = Math.max(margin, (pageW - totalW) / 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  slots.forEach((s, i) => {
    const x = startX + i * (lineW + 20);
    doc.line(x, sigY, x + lineW, sigY);
    doc.text(s.label, x + lineW / 2, sigY + 12, { align: "center" });
  });

  if (input.relacao.assinatura_nome && input.relacao.assinado_em) {
    const hashShort = (input.relacao.assinatura_hash ?? "").slice(0, 8);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    const x = startX;
    doc.text(
      `Assinado digitalmente por ${input.relacao.assinatura_nome}`,
      x + lineW / 2,
      sigY + 24,
      { align: "center" },
    );
    doc.text(
      `em ${fmtDataHoraBR(input.relacao.assinado_em)} — hash ${hashShort}`,
      x + lineW / 2,
      sigY + 34,
      { align: "center" },
    );
    doc.setTextColor(0);
  }

  return doc;
}

function shortLocal(nome: string): string {
  if (!nome) return "";
  // Corta parênteses e reduz para uma abreviação legível
  const semParen = nome.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (semParen.length <= 18) return semParen;
  // pega iniciais das palavras maiores
  const parts = semParen.split(/\s+/).filter((w) => w.length > 2);
  if (parts.length >= 2) return parts.slice(0, 3).map((w) => w[0]?.toUpperCase()).join("");
  return semParen.slice(0, 18) + "…";
}