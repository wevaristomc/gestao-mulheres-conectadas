import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Fase 3a — Rascunho estruturado (sem IA).
// A montagem de contexto lê apenas views/tabelas já existentes no schema real
// e produz um snapshot em `jsonb` + resumos markdown por seção do modelo
// oficial "2-MODELO_RELATORIO_DO_CUMPRIMENTO_DO_OBJETO".
// A geração via IA + exportação DOCX vem nas fases 3b/3c.
// ---------------------------------------------------------------------------

const SECOES_KEYS = [
  "historico",
  "divulgacao",
  "metas",
  "parcerias",
  "monitoramento",
  "material",
  "objetivos",
  "avaliacao",
] as const;
type SecaoKey = (typeof SECOES_KEYS)[number];

const CriarInput = z.object({
  projetoId: z.string().uuid(),
  ciclo: z.number().int().nullable().optional(),
  periodoInicio: z.string().nullable().optional(),
  periodoFim: z.string().nullable().optional(),
  titulo: z.string().max(300).nullable().optional(),
});

const AtualizarSecaoInput = z.object({
  id: z.string().uuid(),
  secao: z.enum(SECOES_KEYS),
  texto: z.string().max(50_000),
});

const AtualizarMetaInput = z.object({
  id: z.string().uuid(),
  titulo: z.string().max(300).optional(),
  status: z.enum(["rascunho", "revisado", "exportado"]).optional(),
  ciclo: z.number().int().nullable().optional(),
  periodoInicio: z.string().nullable().optional(),
  periodoFim: z.string().nullable().optional(),
});

const ExcluirInput = z.object({ id: z.string().uuid() });
const IdInput = z.object({ id: z.string().uuid() });
const RegerarInput = z.object({ id: z.string().uuid() });
const GerarInput = z.object({
  id: z.string().uuid(),
  secao: z.enum(SECOES_KEYS),
  instrucaoExtra: z.string().max(2000).optional(),
});
const ExportarDocxInput = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function validarAcessoProjeto(supabase: any, userId: string, projetoId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role, projeto_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao validar permissões: ${error.message}`);
  const ok = (roles ?? []).some(
    (r: { projeto_id?: string | null }) => r.projeto_id === projetoId || r.projeto_id == null,
  );
  if (!ok) throw new Response("Forbidden: usuário sem vínculo com o projeto.", { status: 403 });
}

type Row = Record<string, unknown>;

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function pct(a: number, b: number): number {
  if (!b) return 0;
  return Math.round((a / b) * 1000) / 10;
}

function dentroPeriodo(iso: string | null | undefined, ini: string | null, fim: string | null): boolean {
  if (!iso) return !ini && !fim ? true : true; // sem data no registro => não exclui
  if (ini && iso < ini) return false;
  if (fim && iso > fim) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Montagem do contexto estruturado a partir do schema real
// ---------------------------------------------------------------------------

type ContextoParcial = {
  projeto: { id: string; nome: string | null; data_inicio: string | null; data_fim: string | null } | null;
  filtro: { ciclo: number | null; periodo_inicio: string | null; periodo_fim: string | null };
  turmas: {
    total: number;
    por_municipio: Record<string, number>;
    por_curso: Record<string, number>;
    lista: Array<{ id: string; codigo: string | null; curso: string | null; municipio: string | null; ciclo: number | null; vagas: number | null }>;
  };
  cursos_executados: { total_linhas: number; matriculadas: number; concluintes: number; evadidas: number; ch_total: number };
  consolidacao: { total_turmas: number; matriculadas: number; freq_media: number | null; certificados: number };
  checklist_pmq: { total: number; itens_ok: number; itens_pendentes: number };
  indicadores: Array<Record<string, unknown>>;
  metas_previstas: Array<Record<string, unknown>>;
  evidencias: { total: number; por_tipo: Record<string, number> };
};

async function montarContexto(admin: any, params: { projetoId: string; ciclo: number | null; ini: string | null; fim: string | null }): Promise<ContextoParcial> {
  const { projetoId } = params;

  // Projeto ------------------------------------------------------------------
  const projRes = await admin.from("projetos").select("*").eq("id", projetoId).maybeSingle();
  const p = (projRes.data ?? null) as Row | null;
  const projeto = p
    ? {
        id: projetoId,
        nome: (p.nome as string | null) ?? (p.titulo as string | null) ?? null,
        data_inicio: (p.data_inicio as string | null) ?? (p.inicio as string | null) ?? null,
        data_fim: (p.data_fim as string | null) ?? (p.fim as string | null) ?? null,
      }
    : null;

  // Turmas do projeto (filtradas por ciclo se aplicável) ---------------------
  const turmasRes = await admin.from("turmas").select("*").eq("projeto_id", projetoId);
  const todasTurmas = ((turmasRes.data ?? []) as Row[])
    .filter((t) => params.ciclo == null || Number(t.ciclo) === params.ciclo);
  const turmaIds = todasTurmas.map((t) => String(t.id));
  const porMunicipio: Record<string, number> = {};
  const porCurso: Record<string, number> = {};
  for (const t of todasTurmas) {
    const mu = str(t.municipio) || "—";
    const cu = str(t.nome_curso) || "—";
    porMunicipio[mu] = (porMunicipio[mu] ?? 0) + 1;
    porCurso[cu] = (porCurso[cu] ?? 0) + 1;
  }

  // Views MTE — descoberta defensiva; se view não existir, ignora silencioso
  async function safeView(nome: string): Promise<Row[]> {
    const r = await admin.from(nome).select("*").limit(5000);
    if (r.error) return [];
    return (r.data ?? []) as Row[];
  }

  const vwCursos = (await safeView("vw_cursos_executados")).filter((r) => {
    if (params.ciclo != null && r.ciclo != null && Number(r.ciclo) !== params.ciclo) return false;
    return true;
  });
  const vwCons = (await safeView("vw_consolidacao_turma")).filter((r) => {
    if (params.ciclo != null && r.ciclo != null && Number(r.ciclo) !== params.ciclo) return false;
    if (r.turma_id && turmaIds.length && !turmaIds.includes(String(r.turma_id))) return false;
    return true;
  });
  const vwCheck = (await safeView("vw_checklist_fiscalizacao")).filter((r) => {
    if (params.ciclo != null && r.ciclo != null && Number(r.ciclo) !== params.ciclo) return false;
    if (r.turma_id && turmaIds.length && !turmaIds.includes(String(r.turma_id))) return false;
    return true;
  });
  const vwInd = (await safeView("vw_indicadores_ciclo")).filter((r) => {
    if (params.ciclo != null && r.ciclo != null && Number(r.ciclo) !== params.ciclo) return false;
    return true;
  });

  // Metas previstas
  const metasRes = await admin.from("metas").select("*");
  const metas = ((metasRes.data ?? []) as Row[]).filter((r) => {
    if (params.ciclo != null && r.ciclo != null && Number(r.ciclo) !== params.ciclo) return false;
    return true;
  });

  // Evidências das turmas do projeto (filtro de período aplicado sobre created_at)
  let evTotal = 0;
  const evPorTipo: Record<string, number> = {};
  if (turmaIds.length) {
    const evRes = await admin
      .from("evidencias")
      .select("id, tipo, created_at")
      .in("turma_id", turmaIds);
    const evs = ((evRes.data ?? []) as Row[]).filter((e) =>
      dentroPeriodo(str(e.created_at).slice(0, 10) || null, params.ini, params.fim),
    );
    evTotal = evs.length;
    for (const e of evs) {
      const t = str(e.tipo) || "outros";
      evPorTipo[t] = (evPorTipo[t] ?? 0) + 1;
    }
  }

  // Agregados de vw_consolidacao_turma
  let consMat = 0;
  let consCert = 0;
  let freqAcc = 0;
  let freqN = 0;
  for (const r of vwCons) {
    consMat += num(r.matriculadas ?? r.total_matriculadas);
    consCert += num(r.certificados ?? r.certificadas);
    const f = num(r.frequencia_media ?? r.freq_media);
    if (f > 0) {
      freqAcc += f;
      freqN += 1;
    }
  }

  // Agregados de vw_cursos_executados
  let cMat = 0, cCon = 0, cEva = 0, cCh = 0;
  for (const r of vwCursos) {
    cMat += num(r.matriculadas ?? r.inscritas);
    cCon += num(r.concluintes);
    cEva += num(r.evadidas);
    cCh += num(r.ch_total ?? r.ch);
  }

  // Checklist PMQ
  let checkOk = 0;
  let checkPend = 0;
  for (const r of vwCheck) {
    const okKeys = ["identificacao_pmq", "pmq_ok", "possui_pmq", "conforme"];
    const okVal = okKeys.map((k) => r[k]).find((v) => typeof v === "boolean");
    if (okVal === true) checkOk += 1;
    else if (okVal === false) checkPend += 1;
  }

  return {
    projeto,
    filtro: { ciclo: params.ciclo, periodo_inicio: params.ini, periodo_fim: params.fim },
    turmas: {
      total: todasTurmas.length,
      por_municipio: porMunicipio,
      por_curso: porCurso,
      lista: todasTurmas.slice(0, 200).map((t) => ({
        id: String(t.id),
        codigo: (t.codigo_turma as string | null) ?? null,
        curso: (t.nome_curso as string | null) ?? null,
        municipio: (t.municipio as string | null) ?? null,
        ciclo: (t.ciclo as number | null) ?? null,
        vagas: (t.vagas as number | null) ?? null,
      })),
    },
    cursos_executados: { total_linhas: vwCursos.length, matriculadas: cMat, concluintes: cCon, evadidas: cEva, ch_total: cCh },
    consolidacao: {
      total_turmas: vwCons.length,
      matriculadas: consMat,
      certificados: consCert,
      freq_media: freqN ? Math.round((freqAcc / freqN) * 10) / 10 : null,
    },
    checklist_pmq: { total: vwCheck.length, itens_ok: checkOk, itens_pendentes: checkPend },
    indicadores: vwInd.slice(0, 200),
    metas_previstas: metas.slice(0, 200),
    evidencias: { total: evTotal, por_tipo: evPorTipo },
  };
}

// ---------------------------------------------------------------------------
// Rascunhos markdown por seção (Fase 3a — sem IA)
// ---------------------------------------------------------------------------

function tabelaMarkdown(headers: string[], rows: (string | number)[][]): string {
  if (!rows.length) return "_Sem dados no período/ciclo selecionado._";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c ?? "")).join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

function rascunhoSecoes(ctx: ContextoParcial): Record<SecaoKey, { texto: string; atualizado_em: string }> {
  const agora = new Date().toISOString();
  const projeto = ctx.projeto?.nome ?? "Projeto";
  const ciclo = ctx.filtro.ciclo != null ? `Ciclo ${ctx.filtro.ciclo}` : "Ciclo não informado";
  const periodo = ctx.filtro.periodo_inicio || ctx.filtro.periodo_fim
    ? `de ${ctx.filtro.periodo_inicio ?? "?"} a ${ctx.filtro.periodo_fim ?? "?"}`
    : "período não informado";

  const historico = [
    `**Projeto:** ${projeto} — ${ciclo} (${periodo}).`,
    ``,
    `No período em referência foram executadas **${ctx.turmas.total} turma(s)** distribuídas em:`,
    ...Object.entries(ctx.turmas.por_municipio).map(([m, n]) => `- ${m}: ${n} turma(s)`),
    ``,
    `Cursos ofertados:`,
    ...Object.entries(ctx.turmas.por_curso).map(([c, n]) => `- ${c}: ${n} turma(s)`),
    ``,
    `Números consolidados no período (fonte: \`vw_cursos_executados\`):`,
    `- Matriculadas: ${ctx.cursos_executados.matriculadas}`,
    `- Concluintes: ${ctx.cursos_executados.concluintes}`,
    `- Evadidas: ${ctx.cursos_executados.evadidas}`,
    `- CH total: ${ctx.cursos_executados.ch_total}h`,
    ``,
    `_A redação final deste histórico deve trazer o enquadramento institucional, marcos de execução e eventos relevantes que não estão nos dados estruturados._`,
  ].join("\n");

  const divulgacao = [
    `_Descrever as ações de mobilização e divulgação realizadas no período: canais utilizados (redes sociais, rádio, CRAS, escolas, parceiros), materiais produzidos, número estimado de alcance e principais resultados de inscrição._`,
    ``,
    `Base estruturada disponível:`,
    `- Total de turmas ofertadas: ${ctx.turmas.total}`,
    `- Municípios atingidos: ${Object.keys(ctx.turmas.por_municipio).length}`,
    `- Vagas totais: ${ctx.turmas.lista.reduce((s, t) => s + (t.vagas ?? 0), 0)}`,
    `- Matriculadas registradas: ${ctx.cursos_executados.matriculadas}`,
  ].join("\n");

  const metasHead = ["Ciclo", "Município", "Curso", "Prev.", "Matric.", "Concl.", "Certif.", "Freq. média"];
  const metasRows: (string | number)[][] = ctx.indicadores.slice(0, 30).map((r) => [
    str(r.ciclo) || "—",
    str(r.municipio) || "—",
    str(r.curso) || "—",
    num(r.vagas_previstas),
    num(r.matriculadas),
    num(r.concluintes),
    num(r.certificadas),
    (() => {
      const f = num(r.frequencia_media);
      return f ? `${f.toFixed(1)}%` : "—";
    })(),
  ]);
  const metas = [
    `Quadro comparativo entre o previsto no Plano de Trabalho e o realizado no período (fonte: \`vw_indicadores_ciclo\`).`,
    ``,
    tabelaMarkdown(metasHead, metasRows),
    ``,
    `Frequência média consolidada: **${ctx.consolidacao.freq_media != null ? `${ctx.consolidacao.freq_media.toFixed(1)}%` : "—"}**.`,
    `Certificados emitidos: **${ctx.consolidacao.certificados}**.`,
    ``,
    `_Complementar com análise das metas atingidas, parcialmente atingidas e não atingidas, justificando cada caso._`,
  ].join("\n");

  const parcerias = [
    `_Listar as parcerias institucionais formalizadas no período (poder público, sociedade civil, iniciativa privada), especificando o tipo de colaboração (cessão de espaço, apoio operacional, doação, articulação com CRAS/CREAS, secretarias municipais)._`,
    ``,
    `Municípios envolvidos: ${Object.keys(ctx.turmas.por_municipio).join(", ") || "—"}.`,
  ].join("\n");

  const monitoramento = [
    `_Descrever como se deu o acompanhamento: reuniões da coordenação, visitas técnicas, uso do sistema de gestão, controle de frequência, atendimento individualizado às beneficiárias em risco de evasão._`,
    ``,
    `Indicadores estruturados:`,
    `- Turmas com consolidação apurada: ${ctx.consolidacao.total_turmas}`,
    `- Matriculadas ativas: ${ctx.consolidacao.matriculadas}`,
    `- Concluintes: ${ctx.cursos_executados.concluintes}`,
    `- Evadidas: ${ctx.cursos_executados.evadidas} (${pct(ctx.cursos_executados.evadidas, ctx.cursos_executados.matriculadas)}%)`,
    `- Certificados: ${ctx.consolidacao.certificados}`,
  ].join("\n");

  const materialHead = ["Tipo de evidência", "Quantidade"];
  const materialRows: (string | number)[][] = Object.entries(ctx.evidencias.por_tipo).map(([t, n]) => [t, n]);
  const material = [
    `Material comprobatório reunido no período (fonte: tabela \`evidencias\` das turmas do projeto).`,
    ``,
    tabelaMarkdown(materialHead, materialRows),
    ``,
    `Total de evidências no período: **${ctx.evidencias.total}**.`,
    ``,
    `Checklist de identificação PMQ (fonte: \`vw_checklist_fiscalizacao\`):`,
    `- Itens conformes: ${ctx.checklist_pmq.itens_ok}`,
    `- Itens pendentes: ${ctx.checklist_pmq.itens_pendentes}`,
    `- Total avaliado: ${ctx.checklist_pmq.total}`,
    ``,
    `_Anexar ao relatório final, quando aplicável, as listas de presença assinadas, registros fotográficos, atas de reuniões, ofícios expedidos e recebidos._`,
  ].join("\n");

  const objetivos = [
    `Objetivos previstos no Plano de Trabalho relacionados a este período de execução.`,
    ``,
    `Resultados quantitativos alcançados:`,
    `- Beneficiárias matriculadas: ${ctx.cursos_executados.matriculadas}`,
    `- Beneficiárias concluintes: ${ctx.cursos_executados.concluintes} (${pct(ctx.cursos_executados.concluintes, ctx.cursos_executados.matriculadas)}% das matriculadas)`,
    `- Beneficiárias certificadas: ${ctx.consolidacao.certificados}`,
    `- Carga horária efetivamente ofertada: ${ctx.cursos_executados.ch_total}h`,
    ``,
    `_Cruzar cada resultado com os objetivos específicos do Plano de Trabalho e apontar em que grau foram alcançados._`,
  ].join("\n");

  const avaliacao = [
    `_Análise qualitativa da execução no período: impacto observado nas beneficiárias, principais dificuldades enfrentadas (evasão, infraestrutura, articulação), ajustes de rota, aprendizados e recomendações para o próximo ciclo._`,
    ``,
    `Indicadores de referência:`,
    `- Frequência média: ${ctx.consolidacao.freq_media != null ? `${ctx.consolidacao.freq_media.toFixed(1)}%` : "—"}`,
    `- Taxa de conclusão: ${pct(ctx.cursos_executados.concluintes, ctx.cursos_executados.matriculadas)}%`,
    `- Taxa de evasão: ${pct(ctx.cursos_executados.evadidas, ctx.cursos_executados.matriculadas)}%`,
  ].join("\n");

  return {
    historico: { texto: historico, atualizado_em: agora },
    divulgacao: { texto: divulgacao, atualizado_em: agora },
    metas: { texto: metas, atualizado_em: agora },
    parcerias: { texto: parcerias, atualizado_em: agora },
    monitoramento: { texto: monitoramento, atualizado_em: agora },
    material: { texto: material, atualizado_em: agora },
    objetivos: { texto: objetivos, atualizado_em: agora },
    avaliacao: { texto: avaliacao, atualizado_em: agora },
  };
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const criarRascunhoParcialObjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CriarInput.parse(v))
  .handler(async ({ data, context }) => {
    await validarAcessoProjeto(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const ini = data.periodoInicio ?? null;
    const fim = data.periodoFim ?? null;
    const ciclo = data.ciclo ?? null;

    const contexto = await montarContexto(admin, { projetoId: data.projetoId, ciclo, ini, fim });
    const secoes = rascunhoSecoes(contexto);

    const payload = {
      projeto_id: data.projetoId,
      ciclo,
      periodo_inicio: ini,
      periodo_fim: fim,
      titulo: data.titulo ?? null,
      secoes,
      contexto,
      status: "rascunho" as const,
      criado_por: context.userId,
      atualizado_por: context.userId,
    };

    const { data: row, error } = await admin
      .from("relatorios_parcial_objeto")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(`Falha ao criar rascunho: ${error.message}`);
    return { ok: true, row };
  });

export const regenerarContextoParcialObjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RegerarInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: existente, error: readErr } = await admin
      .from("relatorios_parcial_objeto")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existente) throw new Error("Rascunho não encontrado.");
    await validarAcessoProjeto(context.supabase, context.userId, (existente as any).projeto_id);

    const ciclo = (existente as any).ciclo ?? null;
    const ini = (existente as any).periodo_inicio ?? null;
    const fim = (existente as any).periodo_fim ?? null;

    const contexto = await montarContexto(admin, { projetoId: (existente as any).projeto_id, ciclo, ini, fim });
    // Preserva textos já editados; só sobrescreve seções ainda vazias.
    const secoesAntigas = ((existente as any).secoes ?? {}) as Record<string, { texto?: string; atualizado_em?: string }>;
    const secoesNovas = rascunhoSecoes(contexto);
    const merged: Record<string, unknown> = {};
    for (const k of SECOES_KEYS) {
      const prev = secoesAntigas[k];
      if (prev && typeof prev.texto === "string" && prev.texto.trim().length > 0) {
        merged[k] = prev;
      } else {
        merged[k] = secoesNovas[k];
      }
    }

    const { error: upErr } = await admin
      .from("relatorios_parcial_objeto")
      .update({ contexto, secoes: merged, atualizado_por: context.userId })
      .eq("id", data.id);
    if (upErr) throw new Error(`Falha ao regenerar contexto: ${upErr.message}`);
    return { ok: true };
  });

export const atualizarSecaoParcialObjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => AtualizarSecaoInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: existente, error: readErr } = await admin
      .from("relatorios_parcial_objeto")
      .select("projeto_id, secoes")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existente) throw new Error("Rascunho não encontrado.");
    await validarAcessoProjeto(context.supabase, context.userId, (existente as any).projeto_id);

    const secoes = { ...((existente as any).secoes ?? {}) };
    secoes[data.secao] = {
      ...(secoes[data.secao] ?? {}),
      texto: data.texto,
      atualizado_em: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("relatorios_parcial_objeto")
      .update({ secoes, atualizado_por: context.userId })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const atualizarMetaParcialObjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => AtualizarMetaInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: existente, error: readErr } = await admin
      .from("relatorios_parcial_objeto")
      .select("projeto_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existente) throw new Error("Rascunho não encontrado.");
    await validarAcessoProjeto(context.supabase, context.userId, (existente as any).projeto_id);

    const patch: Record<string, unknown> = { atualizado_por: context.userId };
    if (data.titulo !== undefined) patch.titulo = data.titulo;
    if (data.status !== undefined) patch.status = data.status;
    if (data.ciclo !== undefined) patch.ciclo = data.ciclo;
    if (data.periodoInicio !== undefined) patch.periodo_inicio = data.periodoInicio;
    if (data.periodoFim !== undefined) patch.periodo_fim = data.periodoFim;

    const { error: upErr } = await admin
      .from("relatorios_parcial_objeto")
      .update(patch)
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const excluirRascunhoParcialObjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ExcluirInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: existente, error: readErr } = await admin
      .from("relatorios_parcial_objeto")
      .select("projeto_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existente) return { ok: true };
    await validarAcessoProjeto(context.supabase, context.userId, (existente as any).projeto_id);
    const { error } = await admin.from("relatorios_parcial_objeto").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewContextoParcialObjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => IdInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin
      .from("relatorios_parcial_objeto")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Rascunho não encontrado.");
    await validarAcessoProjeto(context.supabase, context.userId, (row as any).projeto_id);
    return { row };
  });

// ---------------------------------------------------------------------------
// Fase 3b — Geração assistida por IA (proposta, não persiste no banco).
// RAG: embed da query da seção → match_documentos_chunks no projeto do
// rascunho → concatena trechos com [Doc N: <titulo>].
// Geração: SEMPRE via executarAiRouter (processo='relatorio_parcial_objeto').
// Nunca chama Lovable AI Gateway para geração de texto (apenas embeddings
// da base de conhecimento reutilizam o gateway, mesmo padrão da Fase 1).
// ---------------------------------------------------------------------------

const SECAO_LABEL: Record<SecaoKey, { label: string; descricao: string; foco: string }> = {
  historico: {
    label: "1. Histórico da execução",
    descricao: "Resumo do que foi executado no período (turmas, aulas, beneficiárias, marcos).",
    foco: "Descreva cronologicamente o que foi executado, com números consolidados e marcos institucionais relevantes.",
  },
  divulgacao: {
    label: "2. Divulgação e mobilização",
    descricao: "Ações de divulgação, canais, inscrições, seleção.",
    foco: "Descreva canais utilizados, materiais produzidos, alcance estimado e resultados de inscrição/seleção.",
  },
  metas: {
    label: "3. Metas previstas × realizadas",
    descricao: "Quadro comparativo previsto/realizado.",
    foco: "Compare cada meta prevista no Plano de Trabalho com o realizado, justificando parciais/não atingidas.",
  },
  parcerias: {
    label: "4. Parcerias e articulação institucional",
    descricao: "Parcerias com poder público, sociedade civil e iniciativa privada.",
    foco: "Liste parcerias formalizadas no período, tipo de colaboração e resultados obtidos.",
  },
  monitoramento: {
    label: "5. Monitoramento e acompanhamento",
    descricao: "Como a execução foi monitorada (visitas, sistemas, frequência, evasão).",
    foco: "Descreva instrumentos de acompanhamento, reuniões, visitas técnicas e ações contra evasão.",
  },
  material: {
    label: "6. Material comprobatório",
    descricao: "Evidências: listas de presença, fotos, atas, ofícios.",
    foco: "Organize por tipo de evidência, referenciando volumes; cite documentos anexos quando aplicável.",
  },
  objetivos: {
    label: "7. Objetivos e resultados alcançados",
    descricao: "Objetivos do Plano de Trabalho e grau de alcance.",
    foco: "Cruze cada objetivo do Plano de Trabalho com resultados quantitativos e qualitativos alcançados.",
  },
  avaliacao: {
    label: "8. Avaliação dos resultados",
    descricao: "Análise qualitativa: impacto, dificuldades, ajustes.",
    foco: "Faça análise qualitativa: impacto nas beneficiárias, dificuldades enfrentadas, aprendizados, recomendações.",
  },
};

function jsonBloqueado(obj: unknown, max = 8000): string {
  const s = JSON.stringify(obj, null, 2);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… (truncado — ${s.length - max} chars restantes)`;
}

function textoLimpo(s: string, max = 1200): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export const gerarSecaoParcialObjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => GerarInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: row, error: readErr } = await admin
      .from("relatorios_parcial_objeto")
      .select("id, projeto_id, ciclo, periodo_inicio, periodo_fim, titulo, contexto, secoes")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Rascunho não encontrado.");
    await validarAcessoProjeto(context.supabase, context.userId, (row as any).projeto_id);

    const projetoId = String((row as any).projeto_id);
    const secaoKey = data.secao;
    const secaoMeta = SECAO_LABEL[secaoKey];
    const contexto = ((row as any).contexto ?? {}) as Record<string, unknown>;
    const secoes = ((row as any).secoes ?? {}) as Record<string, { texto?: string }>;
    const textoAtual = String(secoes[secaoKey]?.texto ?? "");

    // RAG: embed da query e busca no projeto ------------------------------------
    type Trecho = {
      chunk_id: string;
      documento_id: string;
      ordem: number;
      texto: string;
      similarity: number;
      titulo: string | null;
      categoria: string | null;
      formato: string | null;
      storage_path: string | null;
    };
    let trechos: Trecho[] = [];
    try {
      const { embedTexto, vetorToLiteral } = await import("@/lib/base-conhecimento-embed.server");
      const queryRAG = [
        `Seção: ${secaoMeta.label}`,
        secaoMeta.descricao,
        secaoMeta.foco,
        data.instrucaoExtra ?? "",
        textoLimpo(textoAtual, 400),
      ]
        .filter(Boolean)
        .join("\n");
      const vetor = await embedTexto(queryRAG);
      if (vetor) {
        const { data: rows } = await admin.rpc("match_documentos_chunks", {
          p_projeto_id: projetoId,
          p_query_embedding: vetorToLiteral(vetor),
          p_match_count: 6,
          p_categorias: null,
        });
        trechos = (rows ?? []) as Trecho[];
      }
    } catch (e) {
      // RAG opcional — se falhar, segue sem citações e registra no retorno.
    }

    const citacoes = trechos.map((t, i) => ({
      ref: `Doc ${i + 1}`,
      titulo: t.titulo,
      documento_id: t.documento_id,
      similarity: Math.round(t.similarity * 1000) / 1000,
    }));

    const trechosMd = trechos.length
      ? trechos
          .map(
            (t, i) =>
              `[Doc ${i + 1}: ${t.titulo ?? "sem título"} · similaridade ${(t.similarity * 100).toFixed(0)}%]\n${textoLimpo(t.texto, 900)}`,
          )
          .join("\n\n")
      : "_Nenhum documento indexado retornou trechos relevantes para esta seção._";

    // Prompt -----------------------------------------------------------------
    const system = [
      "Você redige seções do **Relatório Parcial de Execução do Objeto** para prestação de contas ao SEI/TransfereGov (DEQ_FISCAL Item I).",
      "Segue o modelo institucional \"2-MODELO_RELATORIO_DO_CUMPRIMENTO_DO_OBJETO\": linguagem formal impessoal, terceira pessoa, foco em execução, sem juízo de valor exagerado.",
      "REGRAS OBRIGATÓRIAS:",
      "1. NUNCA invente números, datas, nomes de pessoas, parcerias ou eventos que não estejam no CONTEXTO ESTRUTURADO ou nos TRECHOS DA BASE DE CONHECIMENTO.",
      "2. Quando referenciar um trecho da base de conhecimento, cite entre colchetes assim: [Doc 1] ou [Doc 3] (mesma numeração dos trechos fornecidos).",
      "3. Se faltar dado para uma afirmação, escreva entre colchetes: [preencher: descrição do que falta] — melhor deixar lacuna do que inventar.",
      "4. NÃO inclua saudações, meta-comentários, explicações sobre o processo ou notas ao leitor humano.",
      "5. Aceita Markdown (títulos ###, listas, tabelas) quando fizer sentido para a seção.",
      "6. Foque exclusivamente na seção solicitada; não gere as demais.",
    ].join("\n");

    const user = [
      `# Projeto e período`,
      `- Projeto: ${(contexto as any)?.projeto?.nome ?? "—"}`,
      `- Ciclo: ${((row as any).ciclo as number | null) ?? "—"}`,
      `- Período: ${((row as any).periodo_inicio as string | null) ?? "?"} a ${((row as any).periodo_fim as string | null) ?? "?"}`,
      ``,
      `# Seção a redigir`,
      `**${secaoMeta.label}** — ${secaoMeta.descricao}`,
      `Instruções específicas da seção: ${secaoMeta.foco}`,
      data.instrucaoExtra ? `\nInstrução adicional do revisor humano: ${data.instrucaoExtra}` : ``,
      ``,
      `# Contexto estruturado (fonte primária de números — não invente)`,
      "```json",
      jsonBloqueado(contexto, 7000),
      "```",
      ``,
      `# Trechos da base de conhecimento (fonte primária qualitativa — cite como [Doc N])`,
      trechosMd,
      ``,
      textoAtual.trim()
        ? `# Rascunho atual da seção (pode ser aproveitado como ponto de partida)\n${textoAtual}`
        : `# Rascunho atual da seção\n_(vazio)_`,
      ``,
      `# Sua tarefa`,
      `Escreva o conteúdo final da seção \"${secaoMeta.label}\" pronto para revisão humana. Comece diretamente pelo texto da seção (sem repetir o cabeçalho da seção).`,
    ]
      .filter(Boolean)
      .join("\n");

    // Chama executarAiRouter --------------------------------------------------
    const { executarAiRouter } = await import("@/lib/ia.functions");
    const resultado = await executarAiRouter({
      admin,
      processo: "relatorio_parcial_objeto",
      mensagens: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      defaults: { max_tokens: 4096, temperatura: 0.4 },
    });

    return {
      ok: true,
      texto: String((resultado as { content?: string }).content ?? ""),
      provedor: (resultado as { provedor?: string }).provedor ?? null,
      modelo: (resultado as { modelo?: string }).modelo ?? null,
      fallback_de: (resultado as { fallback_de?: string }).fallback_de ?? null,
      tokens: {
        entrada: (resultado as { tokens_entrada?: number }).tokens_entrada ?? 0,
        saida: (resultado as { tokens_saida?: number }).tokens_saida ?? 0,
      },
      citacoes,
      aviso: "Gerado por IA — revisar antes de enviar ao SEI/TransfereGov.",
    };
  });