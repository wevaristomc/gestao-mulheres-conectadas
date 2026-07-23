// Agregações puras (client-side) para o Dashboard de Inscrições.
// Espelham as abas do Excel `Relatorio_Pre_Inscricoes_Mulheres_2026.xlsx`.
// Fonte: InscricaoDigitalRow[] já retornado por `listarInscricoesDigitais`.

import { onlyDigits, isValidCpf } from "@/lib/cpf";
import { parseISODateLocal, pctSeguro } from "@/lib/date-utils";
import type { InscricaoDigitalRow } from "@/lib/inscricao-digital";

export type FaixaEtariaKey =
  | "ate15"
  | "16a17"
  | "18a24"
  | "25a34"
  | "35a44"
  | "45a54"
  | "55mais"
  | "sem_info";

export const FAIXAS: { key: FaixaEtariaKey; label: string; min: number; max: number }[] = [
  { key: "ate15", label: "Até 15 anos", min: 0, max: 15 },
  { key: "16a17", label: "16 a 17 anos", min: 16, max: 17 },
  { key: "18a24", label: "18 a 24 anos", min: 18, max: 24 },
  { key: "25a34", label: "25 a 34 anos", min: 25, max: 34 },
  { key: "35a44", label: "35 a 44 anos", min: 35, max: 44 },
  { key: "45a54", label: "45 a 54 anos", min: 45, max: 54 },
  { key: "55mais", label: "55 anos ou mais", min: 55, max: 200 },
];

export type Turno = "manha" | "tarde" | "noite" | "qualquer" | "sem_info";

function calcIdade(dados: InscricaoDigitalRow["dados"]): number | null {
  const d = parseISODateLocal(dados?.data_nascimento ?? "");
  if (d) {
    const hoje = new Date();
    let idade = hoje.getFullYear() - d.getFullYear();
    const m = hoje.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) idade -= 1;
    if (idade >= 0 && idade <= 120) return idade;
  }
  const direta = (dados as unknown as { idade?: number | string | null })?.idade;
  if (direta != null && direta !== "") {
    const n = typeof direta === "number" ? direta : parseInt(String(direta).replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 120) return n;
  }
  const obs = String(dados?.observacoes ?? "");
  const m = obs.match(/idade\s+informada[:\s]+(\d{1,3})/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= 120) return n;
  }
  return null;
}

function faixaDe(idade: number | null): FaixaEtariaKey {
  if (idade == null) return "sem_info";
  for (const f of FAIXAS) if (idade >= f.min && idade <= f.max) return f.key;
  return "sem_info";
}

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tituloCidade(s: string | null | undefined): string {
  const raw = String(s ?? "").trim();
  if (!raw) return "Não identificada";
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (p.length > 2 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function turnoDe(v: string | null | undefined): Turno {
  const n = norm(v);
  if (n === "manha" || n === "tarde" || n === "noite" || n === "qualquer") return n;
  return "sem_info";
}

function extrairBairro(endereco: string | null | undefined): string {
  const raw = String(endereco ?? "").trim();
  if (!raw) return "";
  // formato usual: "Rua X, 123 - Bairro, Cidade/UF"
  const partes = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (partes.length >= 3) {
    const meio = partes[partes.length - 2];
    const semTraco = meio.includes(" - ") ? meio.split(" - ").pop()! : meio;
    return tituloCidade(semTraco);
  }
  const m = raw.match(/-\s*([^,\-]+?)\s*(?:,|$)/);
  if (m) return tituloCidade(m[1]);
  return "";
}

export type LinhaRegiao = {
  cidade: string;
  candidatas: number;
  pctBase: number;
  idadeMedia: number;
  naoTrabalhando: number;
  ate1SM: number;
  programaSocial: number;
  manha: number;
  tarde: number;
  noite: number;
};

export type LinhaFaixa = {
  key: FaixaEtariaKey;
  label: string;
  candidatas: number;
  pctBase: number;
  naoTrabalhando: number;
  ate1SM: number;
  programaSocial: number;
  manha: number;
  tarde: number;
  noite: number;
};

export type LinhaContagem = { rotulo: string; valor: number; pct: number };

export type DashboardInscricoes = {
  geradoEm: string;
  respostasRecebidas: number;
  candidatasUnicas: number;
  duplicidadesRemovidas: number;
  concentracaoBetim: number;
  indicadores: {
    idadeMedia: number;
    idadeMediana: number;
    naoTrabalhando: number;
    ate1SM: number;
    beneficiariasPS: number;
    disponMultiTurno: number;
    elegiveisPrelim: number;
    cadastrosRevisao: number;
    restricaoAlimentar: number;
    pcd: number;
  };
  regioes: LinhaRegiao[];
  faixas: LinhaFaixa[];
  situacaoTrabalho: LinhaContagem[];
  rendaFamiliar: LinhaContagem[];
  programaSocial: LinhaContagem[];
  bairrosBetim: LinhaContagem[];
  pendencias: Array<{ id: string; nome: string; motivo: string; criadoEm: string }>;
};

export function agregarDashboard(rows: InscricaoDigitalRow[]): DashboardInscricoes {
  const respostasRecebidas = rows.length;

  // Deduplicação por CPF (mantém o primeiro visto — ordenado por criado_em desc na fonte).
  const vistos = new Set<string>();
  const unicas: InscricaoDigitalRow[] = [];
  for (const r of rows) {
    const cpf = onlyDigits(String(r.dados?.cpf ?? ""));
    const chave = cpf.length === 11 ? cpf : `sem-cpf:${r.id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicas.push(r);
  }
  const candidatasUnicas = unicas.length;
  const duplicidadesRemovidas = respostasRecebidas - candidatasUnicas;

  // Idade
  const idades: number[] = [];
  for (const r of unicas) {
    const i = calcIdade(r.dados);
    if (i != null) idades.push(i);
  }
  const idadeMedia = idades.length ? idades.reduce((s, n) => s + n, 0) / idades.length : 0;
  const ord = [...idades].sort((a, b) => a - b);
  const idadeMediana = ord.length
    ? ord.length % 2
      ? ord[(ord.length - 1) / 2]
      : (ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2
    : 0;

  // Indicadores gerais
  let naoTrabalhando = 0,
    ate1SM = 0,
    beneficiariasPS = 0,
    disponMultiTurno = 0,
    elegiveisPrelim = 0,
    cadastrosRevisao = 0,
    restricaoAlimentar = 0,
    pcd = 0;

  const sitTrab = new Map<string, number>();
  const rendaMap = new Map<string, number>();
  const psMap = new Map<string, number>();
  const bairrosBetimMap = new Map<string, number>();
  const regioes = new Map<
    string,
    LinhaRegiao & { _idades: number[] }
  >();
  const faixasCount: Record<
    FaixaEtariaKey,
    { candidatas: number; naoTrabalhando: number; ate1SM: number; programaSocial: number; manha: number; tarde: number; noite: number }
  > = Object.fromEntries(
    [...FAIXAS.map((f) => f.key), "sem_info"].map((k) => [
      k,
      { candidatas: 0, naoTrabalhando: 0, ate1SM: 0, programaSocial: 0, manha: 0, tarde: 0, noite: 0 },
    ]),
  ) as any;

  const pendencias: DashboardInscricoes["pendencias"] = [];

  for (const r of unicas) {
    const d = r.dados ?? ({} as InscricaoDigitalRow["dados"]);
    const idade = calcIdade(d);
    const faixa = faixaDe(idade);
    const turno = turnoDe(d.turno_preferido);
    const cidade = tituloCidade(d.municipio);
    const isBetim = norm(d.municipio) === "betim";
    const naoTrab = norm(d.situacao_trabalho) === norm("Não estou trabalhando");
    const rendaBaixa = norm(d.renda_familiar) === norm("Até 1 salário mínimo");
    const ps = !!d.beneficiaria_programa_social;
    const multiTurno = !!d.disponibilidade_outros_turnos || turno === "qualquer";

    if (naoTrab) naoTrabalhando += 1;
    if (rendaBaixa) ate1SM += 1;
    if (ps) beneficiariasPS += 1;
    if (multiTurno) disponMultiTurno += 1;
    if (d.restricao_alimentar) restricaoAlimentar += 1;
    if (d.pcd) pcd += 1;

    // Regra: elegível se identifica-se como mulher, autorizou dados, tem CPF válido e idade >= 16.
    const cpf = onlyDigits(String(d.cpf ?? ""));
    const cpfOk = cpf.length === 11 && isValidCpf(cpf);
    const idadeOk = idade != null && idade >= 16;
    const mulherOk = norm(d.identifica_se_mulher) === "sim";
    const autorizou = !!d.autorizacao_dados;
    const elegivel = cpfOk && idadeOk && mulherOk && autorizou;
    if (elegivel) elegiveisPrelim += 1;

    const motivos: string[] = [];
    if (!cpfOk) motivos.push("CPF inválido");
    if (!idadeOk) motivos.push(idade == null ? "sem data de nascimento" : `menor de 16 (${idade})`);
    if (!mulherOk) motivos.push("não se identifica como mulher");
    if (!autorizou) motivos.push("sem autorização LGPD");
    if (r.status === "em_revisao") motivos.push("marcada para revisão");
    if (motivos.length) {
      cadastrosRevisao += 1;
      pendencias.push({
        id: r.id,
        nome: String(d.nome ?? "").trim() || "(sem nome)",
        motivo: motivos.join("; "),
        criadoEm: r.criadoEm ?? "",
      });
    }

    // Perfil social
    const sit = String(d.situacao_trabalho ?? "").trim();
    if (sit) sitTrab.set(sit, (sitTrab.get(sit) ?? 0) + 1);
    const renda = String(d.renda_familiar ?? "").trim();
    if (renda) rendaMap.set(renda, (rendaMap.get(renda) ?? 0) + 1);
    psMap.set(ps ? "Beneficiária" : "Não beneficiária", (psMap.get(ps ? "Beneficiária" : "Não beneficiária") ?? 0) + 1);

    // Bairros de Betim
    if (isBetim) {
      const b = extrairBairro(d.endereco) || tituloCidade(d.bairro_referencia) || "Não informado";
      bairrosBetimMap.set(b, (bairrosBetimMap.get(b) ?? 0) + 1);
    }

    // Faixa etária
    const fc = faixasCount[faixa];
    fc.candidatas += 1;
    if (naoTrab) fc.naoTrabalhando += 1;
    if (rendaBaixa) fc.ate1SM += 1;
    if (ps) fc.programaSocial += 1;
    if (turno === "manha") fc.manha += 1;
    else if (turno === "tarde") fc.tarde += 1;
    else if (turno === "noite") fc.noite += 1;

    // Regiões
    const linha = regioes.get(cidade) ?? {
      cidade,
      candidatas: 0,
      pctBase: 0,
      idadeMedia: 0,
      naoTrabalhando: 0,
      ate1SM: 0,
      programaSocial: 0,
      manha: 0,
      tarde: 0,
      noite: 0,
      _idades: [] as number[],
    };
    linha.candidatas += 1;
    if (naoTrab) linha.naoTrabalhando += 1;
    if (rendaBaixa) linha.ate1SM += 1;
    if (ps) linha.programaSocial += 1;
    if (turno === "manha") linha.manha += 1;
    else if (turno === "tarde") linha.tarde += 1;
    else if (turno === "noite") linha.noite += 1;
    if (idade != null) linha._idades.push(idade);
    regioes.set(cidade, linha);
  }

  const regioesArr: LinhaRegiao[] = Array.from(regioes.values())
    .map((l) => ({
      cidade: l.cidade,
      candidatas: l.candidatas,
      pctBase: pctSeguro(l.candidatas, candidatasUnicas),
      idadeMedia: l._idades.length ? l._idades.reduce((s, n) => s + n, 0) / l._idades.length : 0,
      naoTrabalhando: l.naoTrabalhando,
      ate1SM: l.ate1SM,
      programaSocial: l.programaSocial,
      manha: l.manha,
      tarde: l.tarde,
      noite: l.noite,
    }))
    .sort((a, b) => b.candidatas - a.candidatas);

  const faixasArr: LinhaFaixa[] = FAIXAS.map((f) => {
    const c = faixasCount[f.key];
    return {
      key: f.key,
      label: f.label,
      candidatas: c.candidatas,
      pctBase: pctSeguro(c.candidatas, candidatasUnicas),
      naoTrabalhando: c.naoTrabalhando,
      ate1SM: c.ate1SM,
      programaSocial: c.programaSocial,
      manha: c.manha,
      tarde: c.tarde,
      noite: c.noite,
    };
  }).filter((l) => l.candidatas > 0);
  const semInfo = faixasCount["sem_info"];
  if (semInfo.candidatas > 0) {
    faixasArr.push({
      key: "sem_info",
      label: "Sem informação",
      candidatas: semInfo.candidatas,
      pctBase: pctSeguro(semInfo.candidatas, candidatasUnicas),
      naoTrabalhando: semInfo.naoTrabalhando,
      ate1SM: semInfo.ate1SM,
      programaSocial: semInfo.programaSocial,
      manha: semInfo.manha,
      tarde: semInfo.tarde,
      noite: semInfo.noite,
    });
  }

  function toArr(m: Map<string, number>): LinhaContagem[] {
    return Array.from(m.entries())
      .map(([rotulo, valor]) => ({ rotulo, valor, pct: pctSeguro(valor, candidatasUnicas) }))
      .sort((a, b) => b.valor - a.valor);
  }

  const concentracaoBetim = pctSeguro(
    regioesArr.find((r) => norm(r.cidade) === "betim")?.candidatas ?? 0,
    candidatasUnicas,
  );

  return {
    geradoEm: new Date().toISOString(),
    respostasRecebidas,
    candidatasUnicas,
    duplicidadesRemovidas,
    concentracaoBetim,
    indicadores: {
      idadeMedia,
      idadeMediana,
      naoTrabalhando,
      ate1SM,
      beneficiariasPS,
      disponMultiTurno,
      elegiveisPrelim,
      cadastrosRevisao,
      restricaoAlimentar,
      pcd,
    },
    regioes: regioesArr,
    faixas: faixasArr,
    situacaoTrabalho: toArr(sitTrab),
    rendaFamiliar: toArr(rendaMap),
    programaSocial: toArr(psMap),
    bairrosBetim: toArr(bairrosBetimMap),
    pendencias: pendencias.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)),
  };
}

export async function exportarDashboardXlsx(d: DashboardInscricoes, projetoNome: string | null) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const painel: (string | number)[][] = [
    ["RELATÓRIO DE PRÉ-INSCRIÇÕES — CURSO EXCLUSIVO PARA MULHERES"],
    [projetoNome ?? ""],
    [`Base tratada em ${new Date(d.geradoEm).toLocaleString("pt-BR")}`],
    [],
    ["Respostas recebidas", d.respostasRecebidas],
    ["Candidatas únicas", d.candidatasUnicas],
    ["Duplicidades removidas", d.duplicidadesRemovidas],
    ["Concentração em Betim", `${d.concentracaoBetim.toFixed(1)}%`],
    [],
    ["INDICADORES PRINCIPAIS"],
    ["Idade média", Number(d.indicadores.idadeMedia.toFixed(2))],
    ["Mediana de idade", d.indicadores.idadeMediana],
    ["Não estão trabalhando", d.indicadores.naoTrabalhando],
    ["Renda de até 1 salário mínimo", d.indicadores.ate1SM],
    ["Beneficiárias de programa social", d.indicadores.beneficiariasPS],
    ["Disponíveis em mais de um turno", d.indicadores.disponMultiTurno],
    ["Elegíveis preliminarmente", d.indicadores.elegiveisPrelim],
    ["Cadastros para revisão", d.indicadores.cadastrosRevisao],
    ["Com restrição alimentar", d.indicadores.restricaoAlimentar],
    ["Com deficiência/necessidade", d.indicadores.pcd],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(painel), "Painel Geral");

  const regioes: (string | number)[][] = [
    ["Região/Cidade", "Candidatas", "% da base", "Idade média", "Não trabalhando", "Até 1 SM", "Programa social", "Manhã", "Tarde", "Noite"],
    ...d.regioes.map((r) => [
      r.cidade,
      r.candidatas,
      Number((r.pctBase / 100).toFixed(4)),
      Number(r.idadeMedia.toFixed(2)),
      r.naoTrabalhando,
      r.ate1SM,
      r.programaSocial,
      r.manha,
      r.tarde,
      r.noite,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(regioes), "Por Região");

  const faixas: (string | number)[][] = [
    ["Faixa etária", "Candidatas", "% da base", "Não trabalhando", "Até 1 SM", "Programa social", "Manhã", "Tarde", "Noite"],
    ...d.faixas.map((f) => [
      f.label,
      f.candidatas,
      Number((f.pctBase / 100).toFixed(4)),
      f.naoTrabalhando,
      f.ate1SM,
      f.programaSocial,
      f.manha,
      f.tarde,
      f.noite,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(faixas), "Faixa Etária");

  const perfil: (string | number)[][] = [
    ["Situação de trabalho", "Candidatas", "%"],
    ...d.situacaoTrabalho.map((l) => [l.rotulo, l.valor, Number((l.pct / 100).toFixed(4))]),
    [],
    ["Renda familiar", "Candidatas", "%"],
    ...d.rendaFamiliar.map((l) => [l.rotulo, l.valor, Number((l.pct / 100).toFixed(4))]),
    [],
    ["Programa social", "Candidatas", "%"],
    ...d.programaSocial.map((l) => [l.rotulo, l.valor, Number((l.pct / 100).toFixed(4))]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(perfil), "Perfil Social");

  const bairros: (string | number)[][] = [
    ["Bairro (Betim)", "Candidatas", "%"],
    ...d.bairrosBetim.map((l) => [l.rotulo, l.valor, Number((l.pct / 100).toFixed(4))]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bairros), "Bairros");

  const pend: (string | number)[][] = [
    ["Nome", "Motivo", "Criado em"],
    ...d.pendencias.map((p) => [p.nome, p.motivo, p.criadoEm]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pend), "Pendências");

  XLSX.writeFile(wb, `Dashboard_Inscricoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}