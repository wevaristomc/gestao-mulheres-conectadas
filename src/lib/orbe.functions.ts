// Orbe Neural — server functions.
// Roteamento de IA passa EXCLUSIVAMENTE por executarAiRouter (processo
// "orbe_assistente"). Nunca usa Lovable AI Gateway.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executarAiRouter, executarTranscricaoRouter } from "@/lib/ia.functions";

const PROCESSO = "orbe_assistente";
const PROCESSO_TRANSCRICAO = "orbe_transcricao";
const MAX_LINHAS = 100;
const MAX_TOOL_RESULT = 6000;

function extrairToolCall(conteudo: string): { tool?: string; args?: any } | null {
  const tentativas: string[] = [];
  const trimmed = conteudo.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) tentativas.push(trimmed);
  const fence = conteudo.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fence?.[1]) tentativas.push(fence[1]);
  const inline = conteudo.match(/\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}/);
  if (inline?.[0]) tentativas.push(inline[0]);
  for (const raw of tentativas) {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p.tool === "string") return p;
    } catch { /* tenta próximo */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ferramentas (somente leitura). Cada uma retorna JSON compacto.
// Todas usam admin client para bypass RLS (leitura consolidada segura).
// ---------------------------------------------------------------------------

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function limitar<T>(arr: T[]): T[] {
  return arr.slice(0, MAX_LINHAS);
}

async function toolListarTurmas(admin: any) {
  const { data } = await admin
    .from("turmas")
    .select("id, codigo_turma, nome_curso, ch_total, data_inicio, data_fim, vagas, projeto_id")
    .limit(MAX_LINHAS);
  return { turmas: limitar((data ?? []) as any[]) };
}

async function toolDetalharTurma(admin: any, args: { codigo?: string }) {
  const codigo = String(args?.codigo ?? "").trim();
  if (!codigo) return { erro: "informe o código da turma" };
  const { data: t } = await admin
    .from("turmas")
    .select("*")
    .ilike("codigo_turma", `%${codigo}%`)
    .limit(1)
    .maybeSingle();
  if (!t) return { encontrada: false };
  const { count: nMatriculas } = await admin
    .from("matriculas")
    .select("id", { count: "exact", head: true })
    .eq("turma_id", (t as any).id);
  const { count: nAulas } = await admin
    .from("aulas")
    .select("id", { count: "exact", head: true })
    .eq("turma_id", (t as any).id);
  return { turma: t, matriculas: nMatriculas ?? 0, aulas: nAulas ?? 0 };
}

async function toolBuscarBeneficiaria(admin: any, args: { termo?: string }) {
  const termo = String(args?.termo ?? "").trim();
  if (!termo) return { erro: "informe nome ou CPF" };
  const digits = termo.replace(/\D+/g, "");
  let q = admin.from("beneficiarias").select("id, nome_completo, cpf, telefone, email").limit(20);
  if (digits.length >= 6) q = q.ilike("cpf", `%${digits}%`);
  else q = q.ilike("nome_completo", `%${termo}%`);
  const { data } = await q;
  return { resultados: limitar((data ?? []) as any[]) };
}

async function toolMatriculasDaTurma(admin: any, args: { codigo?: string }) {
  const codigo = String(args?.codigo ?? "").trim();
  if (!codigo) return { erro: "informe o código da turma" };
  const { data: t } = await admin
    .from("turmas").select("id, codigo_turma, vagas")
    .ilike("codigo_turma", `%${codigo}%`).limit(1).maybeSingle();
  if (!t) return { encontrada: false };
  const { data } = await admin
    .from("matriculas")
    .select("id, status, beneficiaria_id, beneficiarias(nome_completo, cpf)")
    .eq("turma_id", (t as any).id).limit(MAX_LINHAS);
  return { turma: t, matriculas: limitar((data ?? []) as any[]) };
}

async function toolPendencias(admin: any, args: { status?: string; prioridade?: string }) {
  let q = admin.from("pendencias").select("*").order("criado_em", { ascending: false }).limit(MAX_LINHAS);
  if (args?.status) q = q.eq("status", args.status);
  if (args?.prioridade) q = q.eq("prioridade", args.prioridade);
  const { data } = await q;
  return { pendencias: limitar((data ?? []) as any[]) };
}

async function toolFrequenciaResumo(admin: any, args: { turma?: string }) {
  let turmaId: string | null = null;
  if (args?.turma) {
    const { data: t } = await admin
      .from("turmas").select("id").ilike("codigo_turma", `%${args.turma}%`).limit(1).maybeSingle();
    turmaId = (t as any)?.id ?? null;
  }
  let q = admin.from("frequencia").select("presente, turma_id").limit(5000);
  if (turmaId) q = q.eq("turma_id", turmaId);
  const { data } = await q;
  const rows = (data ?? []) as { presente: boolean }[];
  const total = rows.length;
  const presentes = rows.filter((r) => r.presente).length;
  return { total_marcacoes: total, presentes, taxa_presenca: total ? Math.round((presentes / total) * 100) : null };
}

async function toolAvaDivergencias(admin: any) {
  const { data: cursos } = await admin
    .from("ava_courses").select("moodle_id, shortname, turma_id").limit(200);
  const linhas: any[] = [];
  for (const c of ((cursos ?? []) as any[]).slice(0, 40)) {
    const { count } = await admin
      .from("ava_enrolments").select("id", { count: "exact", head: true }).eq("ava_course_id", c.moodle_id);
    let esperado: number | null = null;
    if (c.turma_id) {
      const { count: cn } = await admin
        .from("matriculas").select("id", { count: "exact", head: true }).eq("turma_id", c.turma_id);
      esperado = cn ?? 0;
    }
    linhas.push({ curso: c.shortname, ava_matriculas: count ?? 0, turma_matriculas: esperado, divergencia: esperado != null && (count ?? 0) !== esperado });
  }
  return { divergencias: linhas.filter((l) => l.divergencia) };
}

async function toolFinanceiroResumo(admin: any) {
  const { data } = await admin
    .from("orcamento_itens").select("valor_previsto, valor_executado").limit(5000);
  const rows = (data ?? []) as { valor_previsto: number | null; valor_executado: number | null }[];
  const previsto = rows.reduce((s, r) => s + Number(r.valor_previsto ?? 0), 0);
  const executado = rows.reduce((s, r) => s + Number(r.valor_executado ?? 0), 0);
  return {
    previsto, executado,
    execucao_pct: previsto > 0 ? Math.round((executado / previsto) * 100) : 0,
    saldo: previsto - executado,
  };
}

async function toolMetasStatus(admin: any) {
  const { data } = await admin.from("metas_indicadores").select("*").limit(MAX_LINHAS);
  return { metas: limitar((data ?? []) as any[]) };
}

async function toolAulasDaTurma(admin: any, args: { codigo?: string }) {
  const codigo = String(args?.codigo ?? "").trim();
  if (!codigo) return { erro: "informe o código da turma" };
  const { data: t } = await admin.from("turmas").select("id").ilike("codigo_turma", `%${codigo}%`).limit(1).maybeSingle();
  if (!t) return { encontrada: false };
  const { data } = await admin
    .from("aulas").select("id, data, ch, conteudo, instrutor")
    .eq("turma_id", (t as any).id).order("data", { ascending: false }).limit(MAX_LINHAS);
  return { aulas: limitar((data ?? []) as any[]) };
}

async function toolDeqResumo(admin: any) {
  const { count } = await safe(async () => await admin.from("deq_chunks").select("id", { count: "exact", head: true }), { count: 0 } as any);
  return { deq_chunks: count ?? 0 };
}

async function toolBuscarConhecimento(admin: any, args: { query?: string; k?: number; projeto_id?: string }) {
  const query = String(args?.query ?? "").trim();
  if (query.length < 2) return { erro: "informe uma consulta" };
  try {
    const { embedTexto, vetorToLiteral } = await import("@/lib/base-conhecimento-embed.server");
    const vetor = await embedTexto(query);
    if (!vetor) return { trechos: [] };
    // Descobre projeto: se informado, usa; senão pega o primeiro projeto do usuário (contexto padrão).
    let projetoId = args?.projeto_id ?? null;
    if (!projetoId) {
      const { data: p } = await admin.from("projetos").select("id").limit(1).maybeSingle();
      projetoId = (p as { id?: string } | null)?.id ?? null;
    }
    if (!projetoId) return { trechos: [] };
    const { data, error } = await admin.rpc("match_documentos_chunks", {
      p_projeto_id: projetoId,
      p_query_embedding: vetorToLiteral(vetor),
      p_match_count: Math.min(Math.max(args?.k ?? 6, 1), 12),
      p_categorias: null,
    });
    if (error) return { erro: error.message };
    return { trechos: (data ?? []).map((r: any) => ({
      titulo: r.titulo, categoria: r.categoria, formato: r.formato,
      similaridade: Math.round((r.similarity ?? 0) * 100),
      texto: String(r.texto ?? "").slice(0, 700),
    })) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "falha na busca semântica" };
  }
}

async function toolEtapasStatus(admin: any) {
  const { data: etapas } = await admin
    .from("etapas")
    .select("id, numero, titulo, status, data_inicio, data_fim")
    .order("numero", { ascending: true });
  const list = (etapas ?? []) as any[];
  if (list.length === 0) return { etapas: [] };
  const ids = list.map((e) => e.id);
  const { data: ativs } = await admin
    .from("etapa_atividades")
    .select("id, etapa_id, grupo, titulo, status, prazo")
    .in("etapa_id", ids);
  const rows = (ativs ?? []) as any[];
  const hoje = Date.now();
  const porEtapa = list.map((e) => {
    const own = rows.filter((r) => r.etapa_id === e.id);
    const total = own.length;
    const concluidas = own.filter((r) => r.status === "concluida").length;
    const atrasadas = own
      .filter((r) => r.status !== "concluida" && r.prazo && new Date(r.prazo + "T23:59:59").getTime() < hoje)
      .map((r) => ({ grupo: r.grupo, titulo: r.titulo, prazo: r.prazo }));
    return {
      numero: e.numero, titulo: e.titulo, status: e.status,
      periodo: `${e.data_inicio ?? "?"} → ${e.data_fim ?? "?"}`,
      progresso_pct: total === 0 ? 0 : Math.round((concluidas / total) * 100),
      total, concluidas,
      atividades_atrasadas: atrasadas.slice(0, 20),
    };
  });
  return { etapas: porEtapa };
}

const TOOLS: Record<string, (admin: any, args: any) => Promise<any>> = {
  listar_turmas: (a) => toolListarTurmas(a),
  detalhar_turma: (a, x) => toolDetalharTurma(a, x),
  buscar_beneficiaria: (a, x) => toolBuscarBeneficiaria(a, x),
  matriculas_da_turma: (a, x) => toolMatriculasDaTurma(a, x),
  pendencias: (a, x) => toolPendencias(a, x),
  frequencia_resumo: (a, x) => toolFrequenciaResumo(a, x),
  ava_divergencias: (a) => toolAvaDivergencias(a),
  financeiro_resumo: (a) => toolFinanceiroResumo(a),
  metas_status: (a) => toolMetasStatus(a),
  aulas_da_turma: (a, x) => toolAulasDaTurma(a, x),
  relatorio_deq_resumo: (a) => toolDeqResumo(a),
  buscar_conhecimento: (a, x) => toolBuscarConhecimento(a, x),
  buscar_base_conhecimento: (a, x) => toolBuscarConhecimento(a, x),
  etapas_status: (a) => toolEtapasStatus(a),
};

const TOOL_DESCRICOES = `
- listar_turmas: lista todas as turmas com CH, vagas e datas.
- detalhar_turma({codigo}): detalhes + total de matrículas e aulas.
- buscar_beneficiaria({termo}): busca por nome ou CPF.
- matriculas_da_turma({codigo}): matrículas de uma turma.
- pendencias({status?,prioridade?}): pendências filtradas.
- frequencia_resumo({turma?}): taxa média de presença.
- ava_divergencias: cursos AVA cujo total de matrículas diverge da turma vinculada.
- financeiro_resumo: previsto, executado, saldo, % (papel financeiro/coordenador_geral).
- metas_status: indicadores/metas cadastradas.
- aulas_da_turma({codigo}): aulas realizadas da turma.
- relatorio_deq_resumo: contagem de chunks DEQ indexados.
- buscar_conhecimento({query,k?}): busca semântica na Base de Conhecimento (relatórios externos, anotações, áudios transcritos, PDFs).
- etapas_status: etapas do projeto com progresso e atividades atrasadas.`.trim();

async function snapshotContexto(admin: any) {
  const nTurmas = await safe(async () => (await admin.from("turmas").select("id", { count: "exact", head: true })).count ?? 0, 0);
  const vagas = await safe(async () => {
    const { data } = await admin.from("turmas").select("vagas").limit(1000);
    return ((data ?? []) as any[]).reduce((s, r) => s + Number(r.vagas ?? 0), 0);
  }, 0);
  const nBenef = await safe(async () => (await admin.from("beneficiarias").select("id", { count: "exact", head: true })).count ?? 0, 0);
  const nMatriculas = await safe(async () => (await admin.from("matriculas").select("id", { count: "exact", head: true })).count ?? 0, 0);
  const chRealizada = await safe(async () => {
    const { data } = await admin.from("aulas").select("ch").limit(5000);
    return ((data ?? []) as any[]).reduce((s, r) => s + Number(r.ch ?? 0), 0);
  }, 0);
  const nAulas = await safe(async () => (await admin.from("aulas").select("id", { count: "exact", head: true })).count ?? 0, 0);
  const pendenciasAbertas = await safe(async () => {
    const { data } = await admin.from("pendencias").select("prioridade, vencimento, status").eq("status", "aberta").limit(500);
    const rows = (data ?? []) as any[];
    const hoje = Date.now();
    return {
      total: rows.length,
      criticas: rows.filter((r) => r.prioridade === "critico" || r.prioridade === "critica").length,
      vencidas: rows.filter((r) => r.vencimento && new Date(r.vencimento).getTime() < hoje).length,
    };
  }, { total: 0, criticas: 0, vencidas: 0 });
  const ultimasAcoes = await safe(async () => {
    const { data } = await admin.from("audit_log").select("acao, entidade, criado_em, ator")
      .order("criado_em", { ascending: false }).limit(10);
    return (data ?? []) as any[];
  }, []);
  const etapaAtualResumo = await safe(async () => {
    const { data: etapas } = await admin
      .from("etapas")
      .select("id, numero, titulo, status, data_inicio, data_fim")
      .order("numero", { ascending: true });
    const list = (etapas ?? []) as any[];
    const atual =
      list.find((e) => e.status === "em_andamento") ??
      list.find((e) => e.status === "prestacao_contas") ??
      list[0];
    if (!atual) return null;
    const { data: ativs } = await admin
      .from("etapa_atividades")
      .select("id, grupo, titulo, status, prazo")
      .eq("etapa_id", atual.id);
    const rows = (ativs ?? []) as any[];
    const hoje = Date.now();
    const total = rows.length;
    const concluidas = rows.filter((r) => r.status === "concluida").length;
    const atrasadas = rows
      .filter((r) => r.status !== "concluida" && r.prazo && new Date(r.prazo + "T23:59:59").getTime() < hoje)
      .map((r) => ({ grupo: r.grupo, titulo: r.titulo, prazo: r.prazo }));
    return {
      numero: atual.numero, titulo: atual.titulo, status: atual.status,
      periodo: `${atual.data_inicio ?? "?"} → ${atual.data_fim ?? "?"}`,
      total, concluidas,
      progresso_pct: total === 0 ? 0 : Math.round((concluidas / total) * 100),
      atrasadas_count: atrasadas.length,
      atrasadas: atrasadas.slice(0, 10),
    };
  }, null);
  return {
    projeto: "Mulheres Conectadas / QUINTA ARTE — Termo de Fomento 01025/2025",
    turmas: nTurmas,
    vagas_totais: vagas,
    beneficiarias: nBenef,
    matriculas: nMatriculas,
    aulas_realizadas: nAulas,
    ch_realizada: chRealizada,
    pendencias_abertas: pendenciasAbertas,
    meta_ciclo1: { previsto: 300, atual: nBenef },
    etapa_atual: etapaAtualResumo,
    ultimas_acoes: ultimasAcoes,
  };
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const orbeContexto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    return snapshotContexto(admin);
  });

export const orbeChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      conversa_id: z.string().uuid().nullable().optional(),
      mensagem: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // Papel do usuário
    const { data: rolesRows } = await admin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const papeis = ((rolesRows ?? []) as any[]).map((r) => r.role);
    const podeFinanceiro = papeis.includes("coordenador_geral") || papeis.includes("gestor_financeiro");

    // Conversa (cria se necessário)
    let conversaId = data.conversa_id ?? null;
    let historico: { role: string; content: string; tool_name?: string | null }[] = [];
    if (conversaId) {
      const { data: msgs } = await admin
        .from("orbe_mensagens").select("role, content, tool_name")
        .eq("conversa_id", conversaId).order("criado_em", { ascending: true }).limit(40);
      historico = (msgs ?? []) as any[];
    } else {
      const titulo = data.mensagem.slice(0, 60);
      const { data: nova, error } = await admin
        .from("orbe_conversas")
        .insert({ user_id: context.userId, titulo })
        .select("id").single();
      if (error) throw new Error(error.message);
      conversaId = (nova as any).id;
    }

    // Persiste mensagem do usuário
    await admin.from("orbe_mensagens").insert({
      conversa_id: conversaId, role: "user", content: data.mensagem,
    });

    // Snapshot para o prompt
    const ctx = await snapshotContexto(admin);
    const dataHoje = new Date().toISOString().slice(0, 10);
    const ferramentasPermitidas = Object.keys(TOOLS).filter((k) => k !== "financeiro_resumo" || podeFinanceiro);

    const systemPrompt = `Você é o Orbe — assistente do Projeto Mulheres Conectadas / QUINTA ARTE (Termo de Fomento 01025/2025).
Data de hoje: ${dataHoje}. Papéis do usuário: ${papeis.join(", ") || "sem papel"}.
Snapshot do projeto (JSON):\n${JSON.stringify(ctx)}

FERRAMENTAS DISPONÍVEIS (somente leitura, no máx. ${MAX_LINHAS} linhas):
${TOOL_DESCRICOES}

REGRAS DE TOOL-CALLING:
- Quando precisar de dados reais que NÃO estejam no snapshot, responda APENAS com JSON:
  {"tool":"nome_da_ferramenta","args":{...}}
- Somente uma ferramenta por vez. Nada de texto fora do JSON quando chamar ferramenta.
- Nomes válidos: ${ferramentasPermitidas.join(", ")}.
- Depois que eu executar a ferramenta, você recebe o resultado como mensagem role="tool" e continua o raciocínio.
- Máximo 4 chamadas encadeadas. Depois disso responda em texto (markdown pt-BR).
- Se a pergunta for genérica ou já respondível pelo snapshot, responda direto em markdown.`;

    // Constrói messages para o router
    const mensagensBase: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const m of historico) {
      const c = m.tool_name ? `[ferramenta ${m.tool_name}] ${m.content}` : m.content;
      const role = m.role === "tool" ? "assistant" : (m.role as "user" | "assistant");
      mensagensBase.push({ role, content: c });
    }
    mensagensBase.push({ role: "user", content: data.mensagem });

    // Loop tool-calling
    let respostaFinal = "";
    let iteracoes = 0;
    const mensagensLoop = [...mensagensBase];
    let tokensTotais = 0;
    while (iteracoes < 4) {
      iteracoes += 1;
      const r = await executarAiRouter({
        admin,
        processo: PROCESSO,
        mensagens: mensagensLoop,
      });
      tokensTotais += (r.tokens_entrada ?? 0) + (r.tokens_saida ?? 0);
      const conteudo = String(r.content ?? "").trim();

      // Tenta detectar chamada de ferramenta (JSON)
      const toolCall = extrairToolCall(conteudo);

      if (toolCall && typeof toolCall.tool === "string" && !TOOLS[toolCall.tool]) {
        // Ferramenta desconhecida: instrui o modelo em vez de falhar.
        const aviso = {
          erro: `ferramenta "${toolCall.tool}" não existe`,
          ferramentas_validas: ferramentasPermitidas,
        };
        await admin.from("orbe_mensagens").insert({
          conversa_id: conversaId, role: "tool", tool_name: toolCall.tool,
          content: JSON.stringify(aviso),
        });
        mensagensLoop.push({ role: "assistant", content: conteudo });
        mensagensLoop.push({
          role: "user",
          content: `Ferramenta inválida. Use apenas uma destas: ${ferramentasPermitidas.join(", ")}. Ou responda direto em markdown.`,
        });
        continue;
      }

      if (toolCall && typeof toolCall.tool === "string" && TOOLS[toolCall.tool]) {
        if (toolCall.tool === "financeiro_resumo" && !podeFinanceiro) {
          const negado = { erro: "sem permissão para dados financeiros" };
          await admin.from("orbe_mensagens").insert({
            conversa_id: conversaId, role: "tool", tool_name: toolCall.tool, content: JSON.stringify(negado),
          });
          mensagensLoop.push({ role: "assistant", content: conteudo });
          mensagensLoop.push({ role: "user", content: `Resultado da ferramenta ${toolCall.tool}:\n${JSON.stringify(negado)}` });
          continue;
        }
        const resultado = await safe(() => TOOLS[toolCall!.tool!](admin, toolCall!.args ?? {}), { erro: "falha na ferramenta" });
        const resultadoStr = JSON.stringify(resultado).slice(0, MAX_TOOL_RESULT);
        await admin.from("orbe_mensagens").insert({
          conversa_id: conversaId, role: "tool", tool_name: toolCall.tool,
          content: resultadoStr,
        });
        mensagensLoop.push({ role: "assistant", content: conteudo });
        mensagensLoop.push({
          role: "user",
          content: `Resultado da ferramenta ${toolCall.tool}:\n${resultadoStr}`,
        });
        continue;
      }

      respostaFinal = conteudo || "Não consegui gerar uma resposta.";
      break;
    }

    if (!respostaFinal) respostaFinal = "Limite de chamadas de ferramentas atingido. Reformule a pergunta, por favor.";

    // Persiste resposta do assistente e atualiza conversa
    await admin.from("orbe_mensagens").insert({
      conversa_id: conversaId, role: "assistant", content: respostaFinal, tokens: tokensTotais,
    });
    await admin.from("orbe_conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", conversaId);

    return { conversa_id: conversaId, resposta: respostaFinal, tokens: tokensTotais };
  });

export const orbeListarConversas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("orbe_conversas").select("id, titulo, atualizado_em")
      .eq("user_id", context.userId).order("atualizado_em", { ascending: false }).limit(30);
    return { conversas: (data ?? []) as any[] };
  });

export const orbeCarregarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversa_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: c } = await admin.from("orbe_conversas").select("*").eq("id", data.conversa_id).maybeSingle();
    if (!c || (c as any).user_id !== context.userId) throw new Error("Conversa não encontrada.");
    const { data: msgs } = await admin.from("orbe_mensagens")
      .select("id, role, content, tool_name, criado_em")
      .eq("conversa_id", data.conversa_id).order("criado_em", { ascending: true });
    return { conversa: c, mensagens: (msgs ?? []) as any[] };
  });

export const orbeApagarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversa_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    await admin.from("orbe_conversas").delete().eq("id", data.conversa_id).eq("user_id", context.userId);
    return { ok: true };
  });

export const orbeNotificacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ apenas_nao_lidas: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    let q = admin.from("notificacoes")
      .select("id, tipo, severidade, titulo, corpo, link_rota, lida, criado_em, user_id")
      .or(`user_id.eq.${context.userId},user_id.is.null`)
      .order("criado_em", { ascending: false }).limit(50);
    if (data.apenas_nao_lidas) q = q.eq("lida", false);
    const { data: rows } = await q;
    return { notificacoes: (rows ?? []) as any[] };
  });

export const orbeMarcarLida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    await admin.from("notificacoes").update({ lida: true }).eq("id", data.id);
    return { ok: true };
  });

async function jaExisteNotificacao(admin: any, tipo: string, chave: string): Promise<boolean> {
  const dtLimite = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await admin.from("notificacoes")
    .select("id").eq("tipo", tipo).eq("chave_dedup", chave).gte("criado_em", dtLimite).limit(1);
  return ((data ?? []) as any[]).length > 0;
}

async function inserirNotif(admin: any, n: {
  user_id?: string | null; tipo: string; severidade: "info" | "aviso" | "critico";
  titulo: string; corpo?: string; link_rota?: string; chave_dedup: string;
}) {
  if (await jaExisteNotificacao(admin, n.tipo, n.chave_dedup)) return false;
  const { error } = await admin.from("notificacoes").insert({
    user_id: n.user_id ?? null, tipo: n.tipo, severidade: n.severidade,
    titulo: n.titulo, corpo: n.corpo ?? null, link_rota: n.link_rota ?? null,
    chave_dedup: n.chave_dedup, origem: "orbe",
  });
  return !error;
}

export const orbeVerificarAlertas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const gerados: string[] = [];

    // Pendências críticas vencidas ou vencendo em 48h
    await safe(async () => {
      const limite = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const { data } = await admin.from("pendencias")
        .select("id, titulo, vencimento, prioridade, status")
        .eq("status", "aberta").in("prioridade", ["critico", "critica"])
        .lte("vencimento", limite).limit(50);
      for (const p of ((data ?? []) as any[])) {
        const ok = await inserirNotif(admin, {
          tipo: "pendencia_critica", severidade: "critico",
          titulo: `Pendência crítica: ${p.titulo ?? "sem título"}`,
          corpo: p.vencimento ? `Vencimento: ${p.vencimento}` : undefined,
          link_rota: "/pendencias", chave_dedup: String(p.id),
        });
        if (ok) gerados.push("pendencia_critica");
      }
    }, undefined);

    // Turmas com número inesperado de matrículas (23/152/3 casos)
    await safe(async () => {
      const { data: turmas } = await admin.from("turmas").select("id, codigo_turma, vagas").limit(200);
      for (const t of ((turmas ?? []) as any[])) {
        const { count } = await admin.from("matriculas")
          .select("id", { count: "exact", head: true }).eq("turma_id", t.id);
        const esperado = Number(t.vagas ?? 0);
        if (!esperado || (count ?? 0) === esperado) continue;
        const ok = await inserirNotif(admin, {
          tipo: "matriculas_divergente", severidade: "aviso",
          titulo: `Turma ${t.codigo_turma}: ${count ?? 0}/${esperado} matrículas`,
          link_rota: "/mte/turmas", chave_dedup: String(t.id),
        });
        if (ok) gerados.push("matriculas_divergente");
      }
    }, undefined);

    // Meta ciclo 1 abaixo de 300
    await safe(async () => {
      const { count } = await admin.from("beneficiarias").select("id", { count: "exact", head: true });
      if ((count ?? 0) < 300) {
        const ok = await inserirNotif(admin, {
          tipo: "meta_ciclo1", severidade: "aviso",
          titulo: `Meta Ciclo 1 abaixo de 300 (${count ?? 0}/300)`,
          link_rota: "/relatorios/metas", chave_dedup: "ciclo1",
        });
        if (ok) gerados.push("meta_ciclo1");
      }
    }, undefined);

    // Aulas sem frequência lançada há mais de 7 dias
    await safe(async () => {
      const limite = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const { data } = await admin.from("aulas")
        .select("id, data, turma_id").lte("data", limite).limit(200);
      for (const a of ((data ?? []) as any[])) {
        const { count } = await admin.from("frequencia").select("id", { count: "exact", head: true }).eq("aula_id", a.id);
        if ((count ?? 0) > 0) continue;
        const ok = await inserirNotif(admin, {
          tipo: "aula_sem_frequencia", severidade: "aviso",
          titulo: `Aula ${a.data} sem frequência lançada`,
          link_rota: "/mte/presencas", chave_dedup: String(a.id),
        });
        if (ok) gerados.push("aula_sem_frequencia");
      }
    }, undefined);

    return { gerados: gerados.length, tipos: gerados };
  });

// ---------------------------------------------------------------------------
// Transcrição (entrada por voz)
// ---------------------------------------------------------------------------

export const orbeTranscrever = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      audio_base64: z.string().min(1),
      mime_type: z.string().min(1).default("audio/webm"),
      filename: z.string().min(1).default("gravacao.webm"),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    // Decodifica base64 → Uint8Array → Blob (evita depender de atob no worker).
    const b64 = data.audio_base64.replace(/^data:[^;]+;base64,/, "");
    const bin = Buffer.from(b64, "base64");
    const blob = new Blob([bin], { type: data.mime_type });
    try {
      const r = await executarTranscricaoRouter({
        admin,
        processo: PROCESSO_TRANSCRICAO,
        file: blob,
        filename: data.filename,
        contentType: data.mime_type,
      });
      return { texto: r.text, provedor: r.provedor, modelo: r.modelo };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg);
    }
  });

// ---------------------------------------------------------------------------
// Briefing diário — apenas dados (sem IA)
// ---------------------------------------------------------------------------

export const orbeBriefingDiario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const hoje = new Date();
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
    const fimAmanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 2).toISOString();

    const pendenciasCriticas = await safe(async () => {
      const { data } = await admin.from("pendencias")
        .select("id, titulo, prioridade, vencimento, status")
        .eq("status", "aberta")
        .in("prioridade", ["critico", "critica"])
        .order("vencimento", { ascending: true }).limit(10);
      return (data ?? []) as any[];
    }, []);

    const prazosHojeAmanha = await safe(async () => {
      const { data } = await admin.from("pendencias")
        .select("id, titulo, prioridade, vencimento, status")
        .eq("status", "aberta")
        .gte("vencimento", inicioHoje).lt("vencimento", fimAmanha)
        .order("vencimento", { ascending: true }).limit(20);
      return (data ?? []) as any[];
    }, []);

    const turmasDivergentes = await safe(async () => {
      const { data: turmas } = await admin.from("turmas").select("id, codigo_turma, vagas").limit(200);
      const out: any[] = [];
      for (const t of ((turmas ?? []) as any[])) {
        const esperado = Number(t.vagas ?? 0);
        if (!esperado) continue;
        const { count } = await admin.from("matriculas")
          .select("id", { count: "exact", head: true }).eq("turma_id", t.id);
        if ((count ?? 0) !== esperado) {
          out.push({ codigo_turma: t.codigo_turma, matriculas: count ?? 0, vagas: esperado });
        }
      }
      return out.slice(0, 10);
    }, []);

    const naoLidas = await safe(async () => {
      const { count } = await admin.from("notificacoes")
        .select("id", { count: "exact", head: true })
        .or(`user_id.eq.${context.userId},user_id.is.null`)
        .eq("lida", false);
      return count ?? 0;
    }, 0);

    return {
      data: hoje.toISOString().slice(0, 10),
      pendencias_criticas: pendenciasCriticas,
      prazos_hoje_amanha: prazosHojeAmanha,
      turmas_divergentes: turmasDivergentes,
      notificacoes_nao_lidas: naoLidas,
    };
  });
