import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO_E_FINANCEIRO } from "@/lib/rbac-guard";

// -----------------------------------------------------------------------------
// AI Router (equivalente de "edge function" ai-router, implementado como server
// function do TanStack — respeita o padrão do stack, sem Supabase Edge Fn).
// Toda IA passa pelos provedores cadastrados em ia_provedores; nunca pelo
// Lovable AI Gateway. As api_keys são lidas server-side com service role.
// -----------------------------------------------------------------------------

type Mensagem = { role: "system" | "user" | "assistant"; content: string };

type CallResult = {
  content: string;
  provedor: string;
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
};

async function chamarOpenAICompat(params: {
  base_url: string;
  api_key: string;
  modelo: string;
  mensagens: Mensagem[];
  max_tokens: number;
  temperatura: number;
}): Promise<CallResult> {
  const baseUrl = String(params.base_url ?? "").trim();
  if (!baseUrl) throw new Error("base_url ausente para provedor OpenAI-compatível.");
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const apiKey = String(params.api_key ?? "").replace(/[\r\n\t]/g, "").trim();
  if (!apiKey) {
    throw new Error(
      `API Key ausente para ${params.base_url}. Configure a chave em Configurações > IA.`,
    );
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.modelo,
      messages: params.mensagens,
      max_tokens: params.max_tokens,
      temperature: params.temperatura,
    }),
  });
  const txt = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        `API Key inválida ou truncada para ${params.base_url}. Verifique se você colou a chave completa (sem espaços). Resposta: ${txt.slice(0, 200)}`,
      );
    }
    if (res.status === 429) {
      throw new Error(
        `Modelo "${params.modelo}" temporariamente sem cota no provedor (rate limit upstream). Tente outro modelo em "Modelo padrão" — modelos ":free" do OpenRouter compartilham cota global e frequentemente ficam indisponíveis. Detalhe: ${txt.slice(0, 200)}`,
      );
    }
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  const body = JSON.parse(txt);
  const content = body?.choices?.[0]?.message?.content ?? "";
  return {
    content: String(content),
    provedor: "",
    modelo: params.modelo,
    tokens_entrada: body?.usage?.prompt_tokens ?? 0,
    tokens_saida: body?.usage?.completion_tokens ?? 0,
  };
}

async function chamarGemini(params: {
  base_url: string;
  api_key: string;
  modelo: string;
  mensagens: Mensagem[];
  max_tokens: number;
  temperatura: number;
}): Promise<CallResult> {
  const apiKey = String(params.api_key ?? "").replace(/[\r\n\t]/g, "").trim();
  if (!apiKey) throw new Error(`API Key ausente para ${params.base_url}.`);
  const baseUrl = String(params.base_url ?? "").trim();
  if (!baseUrl) throw new Error("base_url ausente para Gemini.");
  const url = `${baseUrl.replace(/\/+$/, "")}/models/${params.modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const contents = params.mensagens.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: params.max_tokens,
        temperature: params.temperatura,
      },
    }),
  });
  const txt = await res.text();
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        `Cota do Gemini esgotada para "${params.modelo}" (free tier tem limite diário por chave). Aguarde o reset ou troque para uma chave paga. Detalhe: ${txt.slice(0, 200)}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`API Key do Gemini inválida ou sem permissão. Detalhe: ${txt.slice(0, 200)}`);
    }
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  const body = JSON.parse(txt);
  const content = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return {
    content: String(content),
    provedor: "",
    modelo: params.modelo,
    tokens_entrada: body?.usageMetadata?.promptTokenCount ?? 0,
    tokens_saida: body?.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function chamarAnthropic(params: {
  base_url: string;
  api_key: string;
  modelo: string;
  mensagens: Mensagem[];
  max_tokens: number;
  temperatura: number;
}): Promise<CallResult> {
  const baseUrl = String(params.base_url ?? "").trim();
  if (!baseUrl) throw new Error("base_url ausente para Anthropic/Claude.");
  const url = `${baseUrl.replace(/\/+$/, "")}/messages`;
  const apiKey = String(params.api_key ?? "").replace(/[\r\n\t]/g, "").trim();
  if (!apiKey) throw new Error(`API Key ausente para ${params.base_url}.`);
  const system = params.mensagens.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = params.mensagens
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.modelo,
      system: system || undefined,
      messages,
      max_tokens: params.max_tokens,
      temperature: params.temperatura,
    }),
  });
  const txt = await res.text();
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(`Cota do Anthropic esgotada para "${params.modelo}". Detalhe: ${txt.slice(0, 200)}`);
    }
    if (res.status === 401) {
      throw new Error(`API Key do Anthropic inválida. Detalhe: ${txt.slice(0, 200)}`);
    }
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  const body = JSON.parse(txt);
  const content = body?.content?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return {
    content: String(content),
    provedor: "",
    modelo: params.modelo,
    tokens_entrada: body?.usage?.input_tokens ?? 0,
    tokens_saida: body?.usage?.output_tokens ?? 0,
  };
}

function selecionarChamador(codigo: string, baseUrl?: string | null) {
  const c = (codigo || "").toLowerCase();
  const b = (baseUrl || "").toLowerCase();
  if (c.includes("gemini") || c.includes("google") || b.includes("generativelanguage") || b.includes("googleapis")) return "gemini";
  if (c.includes("anthropic") || c.includes("claude") || b.includes("anthropic")) return "anthropic";
  return "openai_compat"; // openrouter, groq, openai, e outros
}

/**
 * Núcleo do ai-router: dado um processo (ex: "chat_geral", "classificacao_edital",
 * "resumo_edital"), lê a política, chama o provedor preferido, faz fallback nos
 * demais ativos por prioridade (menor primeiro = gratuitos), registra em
 * ia_logs_uso. Nunca retorna api_key ao chamador.
 */
export async function executarAiRouter(input: {
  admin: any;
  processo: string;
  mensagens: Mensagem[];
  defaults?: { max_tokens?: number; temperatura?: number };
}): Promise<CallResult & { fallback_de?: string }> {
  const { admin, processo, mensagens } = input;
  const defs = input.defaults ?? {};

  // Política — se não houver, usa defaults sensatos.
  const { data: politicaRow } = await admin
    .from("ia_politicas")
    .select("*")
    .eq("processo", processo)
    .maybeSingle();

  const provedorPreferido = (politicaRow?.provedor_preferido as string | null) ?? null;
  const maxTokens = (politicaRow?.max_tokens as number | null) ?? defs.max_tokens ?? 1024;
  const temperatura = (politicaRow?.temperatura as number | null) ?? defs.temperatura ?? 0.4;
  const usarFallback = politicaRow?.usar_fallback !== false;

  // Provedores ativos ordenados por prioridade crescente (gratuitos primeiro).
  const { data: provedores } = await admin
    .from("ia_provedores")
    .select("*")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });

  const lista = (provedores ?? []) as any[];
  if (lista.length === 0) throw new Error("Nenhum provedor de IA ativo. Configure em Configurações > IA.");

  // Move preferido pro topo.
  const ordenados = [
    ...lista.filter((p) => p.provedor === provedorPreferido),
    ...lista.filter((p) => p.provedor !== provedorPreferido),
  ];

  let primeiroErro: string | null = null;
  let fallbackDe: string | undefined;

  for (const prov of ordenados) {
    if (!prov.api_key || !String(prov.api_key).trim()) continue;
    const modelo = prov.modelo_padrao || (Array.isArray(prov.modelos_disponiveis) ? prov.modelos_disponiveis[0] : "") || "";
    if (!modelo) continue;
    const codigo = String(prov.provedor);
    const tipo = selecionarChamador(codigo, prov.base_url);

    try {
      let r: CallResult;
      const base = { base_url: prov.base_url, api_key: prov.api_key, modelo, mensagens, max_tokens: maxTokens, temperatura };
      if (tipo === "gemini") r = await chamarGemini(base);
      else if (tipo === "anthropic") r = await chamarAnthropic(base);
      else r = await chamarOpenAICompat(base);

      r.provedor = codigo;
      // Log de sucesso
      await admin.from("ia_logs_uso").insert({
        processo,
        provedor: codigo,
        modelo,
        tokens_entrada: r.tokens_entrada,
        tokens_saida: r.tokens_saida,
        sucesso: true,
        erro: null,
      });
      return fallbackDe ? { ...r, fallback_de: fallbackDe } : r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("ia_logs_uso").insert({
        processo,
        provedor: codigo,
        modelo,
        tokens_entrada: 0,
        tokens_saida: 0,
        sucesso: false,
        erro: msg.slice(0, 500),
      });
      if (!primeiroErro) primeiroErro = `${codigo}: ${msg}`;
      if (!usarFallback) break;
      if (!fallbackDe) fallbackDe = codigo;
    }
  }

  throw new Error(`Todos os provedores falharam. Primeiro erro: ${primeiroErro ?? "sem provedores com api_key"}`);
}

// -----------------------------------------------------------------------------
// Server functions expostas ao cliente
// -----------------------------------------------------------------------------

async function checarAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("coordenador_geral") && !roles.includes("administrativo")) {
    throw new Error("Apenas coordenação geral ou administrativo podem configurar IA.");
  }
}

export const aiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((input) =>
    z.object({
      processo: z.string().min(1),
      mensagens: z.array(z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })).min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    void context.userId;
    return executarAiRouter({ admin, processo: data.processo, mensagens: data.mensagens });
  });

export const listarProvedores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .handler(async ({ context }) => {
    await checarAdmin(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("ia_provedores")
      .select("*")
      .order("prioridade", { ascending: true });
    if (error) throw new Error(error.message);
    // Mascara api_key: só devolve preview + flag "tem_key"
    return (data ?? []).map((p: any) => ({
      ...p,
      api_key_preview: p.api_key ? `${String(p.api_key).slice(0, 4)}…${String(p.api_key).slice(-4)}` : null,
      tem_key: !!p.api_key,
      api_key: undefined,
    }));
  });

export const salvarProvedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      api_key: z.string().optional(),
      modelo_padrao: z.string().optional(),
      ativo: z.boolean().optional(),
      prioridade: z.number().int().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await checarAdmin(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const payload: Record<string, unknown> = {};
    if (data.api_key !== undefined && data.api_key.trim() !== "") payload.api_key = data.api_key.trim();
    if (data.modelo_padrao !== undefined) payload.modelo_padrao = data.modelo_padrao;
    if (data.ativo !== undefined) payload.ativo = data.ativo;
    if (data.prioridade !== undefined) payload.prioridade = data.prioridade;
    if (Object.keys(payload).length === 0) return { ok: true };
    const { error } = await admin.from("ia_provedores").update(payload).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testarProvedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await checarAdmin(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: prov, error } = await admin.from("ia_provedores").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (!prov.api_key) throw new Error("Este provedor ainda não tem API Key configurada.");
    const modelo = prov.modelo_padrao || (Array.isArray(prov.modelos_disponiveis) ? prov.modelos_disponiveis[0] : "");
    if (!modelo) throw new Error("Provedor sem modelo padrão. Defina um antes de testar.");
    if (!prov.base_url || typeof prov.base_url !== "string" || !prov.base_url.trim()) {
      throw new Error(`Provedor "${prov.provedor}" está sem base_url configurada. Preencha a URL do endpoint antes de testar.`);
    }
    const tipo = selecionarChamador(String(prov.provedor), prov.base_url);
    const base = { base_url: prov.base_url, api_key: prov.api_key, modelo, mensagens: [{ role: "user" as const, content: "Responda apenas: OK" }], max_tokens: 20, temperatura: 0 };
    let r: CallResult;
    try {
      r = tipo === "gemini" ? await chamarGemini(base)
        : tipo === "anthropic" ? await chamarAnthropic(base)
        : await chamarOpenAICompat(base);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("ia_logs_uso").insert({
        processo: "teste_conexao",
        provedor: prov.provedor,
        modelo,
        tokens_entrada: 0,
        tokens_saida: 0,
        sucesso: false,
        erro: msg.slice(0, 500),
      });
      return { ok: false, erro: msg, modelo, tokens: 0 };
    }
    await admin.from("ia_logs_uso").insert({
      processo: "teste_conexao",
      provedor: prov.provedor,
      modelo,
      tokens_entrada: r.tokens_entrada,
      tokens_saida: r.tokens_saida,
      sucesso: true,
      erro: null,
    });
    return { ok: true, resposta: r.content, modelo, tokens: r.tokens_entrada + r.tokens_saida };
  });

export const listarPoliticas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .handler(async ({ context }) => {
    await checarAdmin(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("ia_politicas").select("*").order("processo");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const salvarPolitica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      provedor_preferido: z.string().nullable().optional(),
      max_tokens: z.number().int().positive().optional(),
      temperatura: z.number().min(0).max(2).optional(),
      usar_fallback: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await checarAdmin(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const payload: Record<string, unknown> = {};
    if (data.provedor_preferido !== undefined) payload.provedor_preferido = data.provedor_preferido;
    if (data.max_tokens !== undefined) payload.max_tokens = data.max_tokens;
    if (data.temperatura !== undefined) payload.temperatura = data.temperatura;
    if (data.usar_fallback !== undefined) payload.usar_fallback = data.usar_fallback;
    const { error } = await admin.from("ia_politicas").update(payload).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listarConsumoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((input) => z.object({ dias: z.number().int().min(1).max(90).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await checarAdmin(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const desde = new Date();
    desde.setDate(desde.getDate() - (data.dias ?? 14));
    const { data: rows, error } = await admin
      .from("ia_logs_uso")
      .select("*")
      .gte("criado_em", desde.toISOString())
      .order("criado_em", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// -----------------------------------------------------------------------------
// Multimodal: leitura de listas de presença digitalizadas (imagem -> JSON)
// -----------------------------------------------------------------------------

type ImagemInput = { mime: string; base64: string };

async function chamarGeminiVision(params: {
  base_url: string;
  api_key: string;
  modelo: string;
  prompt: string;
  imagens: ImagemInput[];
  max_tokens: number;
}) {
  const baseUrl = String(params.base_url ?? "").trim();
  if (!baseUrl) throw new Error("base_url ausente para Gemini Vision.");
  const url = `${baseUrl.replace(/\/+$/, "")}/models/${params.modelo}:generateContent?key=${encodeURIComponent(params.api_key)}`;
  const parts: any[] = [{ text: params.prompt }];
  for (const img of params.imagens) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: params.max_tokens,
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  const body = JSON.parse(txt);
  const content = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  return {
    content: String(content),
    tokens_entrada: body?.usageMetadata?.promptTokenCount ?? 0,
    tokens_saida: body?.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function chamarAnthropicVision(params: {
  base_url: string;
  api_key: string;
  modelo: string;
  prompt: string;
  imagens: ImagemInput[];
  max_tokens: number;
}) {
  const baseUrl = String(params.base_url ?? "").trim();
  if (!baseUrl) throw new Error("base_url ausente para Anthropic Vision.");
  const url = `${baseUrl.replace(/\/+$/, "")}/messages`;
  const content: any[] = [];
  for (const img of params.imagens) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.base64 } });
  }
  content.push({ type: "text", text: params.prompt });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.modelo,
      messages: [{ role: "user", content }],
      max_tokens: params.max_tokens,
      temperature: 0.1,
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  const body = JSON.parse(txt);
  const text = body?.content?.map((p: any) => p.text ?? "").join("") ?? "";
  return {
    content: String(text),
    tokens_entrada: body?.usage?.input_tokens ?? 0,
    tokens_saida: body?.usage?.output_tokens ?? 0,
  };
}

async function chamarOpenAICompatVision(params: {
  base_url: string;
  api_key: string;
  modelo: string;
  prompt: string;
  imagens: ImagemInput[];
  max_tokens: number;
}) {
  const baseUrl = String(params.base_url ?? "").trim();
  if (!baseUrl) throw new Error("base_url ausente para OpenAI-compat Vision.");
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const content: any[] = [{ type: "text", text: params.prompt }];
  for (const img of params.imagens) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.api_key}`,
    },
    body: JSON.stringify({
      model: params.modelo,
      messages: [{ role: "user", content }],
      max_tokens: params.max_tokens,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  const body = JSON.parse(txt);
  return {
    content: String(body?.choices?.[0]?.message?.content ?? ""),
    tokens_entrada: body?.usage?.prompt_tokens ?? 0,
    tokens_saida: body?.usage?.completion_tokens ?? 0,
  };
}

const PROMPT_LISTA_ABERTO = `Você é um extrator de dados de listas de presença escaneadas do programa Mulheres Conectadas (MTE/PMQ).
Cada página tem um cabeçalho e uma tabela com as colunas: Nº, NOME COMPLETO, CPF, Frequência ("Sim" manuscrito ou vazio), Entrega do Lanche, Assinatura manuscrita.
O CPF às vezes vem com ";" no lugar de "." — normalize retornando apenas os 11 dígitos.
Retorne APENAS JSON válido, sem markdown, no formato:
{
  "cabecalho": {
    "turma": "...", "data": "AAAA-MM-DD", "conteudo": "...", "instrutor": "...",
    "horario": "08:00 às 12:00", "ch_dia": 4, "endereco": "...",
    "quantidade_presentes_manuscrita": 16,
    "confianca_cabecalho": 0.9
  },
  "alunas": [
    { "num": 1, "nome": "NOME", "cpf": "11 dígitos ou null",
      "frequencia_sim": true, "lanche_sim": true, "assinatura_presente": true,
      "legivel": true, "confianca": 0.9 }
  ],
  "observacoes": ["..."]
}
Regras: confianca em [0,1]; "quantidade_presentes_manuscrita" é o total escrito à mão no rodapé (ou null). Não invente linhas em branco.`;

function promptListaAncorado(elenco: Array<{ ordem: number; nome: string; cpf: string | null }>) {
  const ficha = elenco
    .map((e) => `  ${e.ordem}. ${e.nome}${e.cpf ? ` (CPF ${e.cpf})` : ""}`)
    .join("\n");
  return `Você está lendo uma lista de presença ESCANEADA do programa Mulheres Conectadas (MTE/PMQ).
A lista foi IMPRESSA pelo sistema com este elenco fixo (nome e CPF já são conhecidos — NÃO precisa re-OCR de identidade):
ELENCO (índice.ordem — nome):
${ficha}

A tabela impressa tem, em cada linha, uma cursista deste elenco (mesma ordem), e as colunas: Nº, NOME, CPF, Frequência ("Sim" manuscrito), Entrega do Lanche (marcado), Assinatura manuscrita.

SUA TAREFA: para CADA linha impressa da lista, retornar apenas as marcas MANUSCRITAS e o mapeamento com o elenco. NÃO re-extraia nome/CPF.

Retorne APENAS JSON válido, sem markdown, no formato:
{
  "cabecalho": {
    "turma": "...", "data": "AAAA-MM-DD", "conteudo": "...", "instrutor": "...",
    "horario": "08:00 às 12:00", "ch_dia": 4, "endereco": "...",
    "quantidade_presentes_manuscrita": 16,
    "confianca_cabecalho": 0.9
  },
  "linhas": [
    {
      "num_linha": 1,
      "elenco_ordem": 1,
      "frequencia_sim": true,
      "lanche_sim": true,
      "assinatura_presente": true,
      "confianca": 0.9
    }
  ],
  "observacoes": ["linha 5 ilegível", "..."]
}

Regras:
- "elenco_ordem" DEVE bater com a posição na tabela impressa (a linha 1 corresponde ao item 1 do elenco, e assim por diante). Se algum trecho estiver ilegível a ponto de você não conseguir confirmar o mapeamento, use null e adicione uma observação.
- "frequencia_sim": true quando houver "Sim" manuscrito na coluna Frequência (aceitar variações do OCR); false se em branco.
- "assinatura_presente": true quando houver traço/rubrica manuscrita na coluna Assinatura.
- "lanche_sim": true quando a coluna de Entrega do Lanche estiver marcada.
- "confianca" é a certeza da leitura manuscrita da linha (0.0 a 1.0). Use < 0.6 quando a assinatura/marca estiver fraca ou ambígua.
- "quantidade_presentes_manuscrita": número escrito à mão no rodapé da página (ou null).
- NÃO invente linhas em branco no fim da tabela.
- Não repita nome/CPF na saída (o sistema já os conhece via elenco).`;
}

const PROMPT_LISTA_VERIFICACAO_HEAD = `Você é um verificador de leitura de lista de presença. Recebe (1) as imagens da lista e (2) o resultado JSON de uma primeira leitura.
SUA TAREFA: conferir linha a linha as MARCAS MANUSCRITAS (Frequência "Sim", Entrega do Lanche, Assinatura) contra as imagens e retornar apenas as CORREÇÕES.

Retorne APENAS JSON válido no formato:
{
  "correcoes": [
    { "num_linha": 3, "frequencia_sim": false, "assinatura_presente": false, "confianca": 0.4, "motivo": "assinatura muito fraca, pode ser rasura" }
  ],
  "total_presentes_contado": 16,
  "observacoes": ["..."]
}

Não inclua linhas que já estão corretas. Cada correção tem apenas os campos que mudam. "total_presentes_contado" é o número de linhas com PRESENÇA (Sim ou assinatura visível) que você contou re-conferindo.`;

function normalizeCpfDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D+/g, "").slice(0, 11);
}

function parseJsonFlexivel(raw: string): any {
  const t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error("A IA retornou um JSON inválido. Trecho: " + t.slice(0, 200));
}

export const lerListaPresenca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((input) =>
    z.object({
      imagens: z.array(z.object({
        mime: z.string().default("image/png"),
        base64: z.string().min(10),
      })).min(1).max(8),
      elenco: z.array(z.object({
        ordem: z.number().int().positive(),
        nome: z.string().min(1),
        cpf: z.string().nullable().optional(),
      })).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: politica } = await admin
      .from("ia_politicas")
      .select("*")
      .eq("processo", "leitura_lista_presenca")
      .maybeSingle();
    const provedorPreferido = (politica?.provedor_preferido as string | null) ?? "gemini";
    const maxTokens = (politica?.max_tokens as number | null) ?? 8192;

    const { data: provedores } = await admin
      .from("ia_provedores")
      .select("*")
      .eq("ativo", true)
      .order("prioridade", { ascending: true });
    const lista = (provedores ?? []) as any[];
    if (!lista.length) throw new Error("Nenhum provedor de IA ativo. Configure em Configurações > IA.");
    const ordenados = [
      ...lista.filter((p) => p.provedor === provedorPreferido),
      ...lista.filter((p) => p.provedor !== provedorPreferido),
    ];

    let primeiroErro: string | null = null;
    for (const prov of ordenados) {
      if (!prov.api_key) continue;
      const modelo = prov.modelo_padrao || (Array.isArray(prov.modelos_disponiveis) ? prov.modelos_disponiveis[0] : "");
      if (!modelo) continue;
      const tipo = selecionarChamador(String(prov.provedor), prov.base_url);
      const usarAncorado = Array.isArray(data.elenco) && data.elenco.length > 0;
      const prompt = usarAncorado
        ? promptListaAncorado(data.elenco!.map((e) => ({
            ordem: e.ordem,
            nome: e.nome,
            cpf: e.cpf ? String(e.cpf).replace(/\D+/g, "").slice(0, 11) : null,
          })))
        : PROMPT_LISTA_ABERTO;
      const base = {
        base_url: prov.base_url,
        api_key: prov.api_key,
        modelo,
        prompt,
        imagens: data.imagens,
        max_tokens: maxTokens,
      };
      try {
        const r =
          tipo === "gemini" ? await chamarGeminiVision(base)
          : tipo === "anthropic" ? await chamarAnthropicVision(base)
          : await chamarOpenAICompatVision(base);
        const parsed = parseJsonFlexivel(r.content);
        // Modo ancorado devolve `linhas` (só marcas manuscritas). Reconstituímos
        // o shape `alunas` (compat com o fluxo antigo) hidratando nome/CPF pelo
        // elenco enviado — a IA NÃO re-OCR de identidade.
        let alunas: any[] = [];
        if (usarAncorado && Array.isArray(parsed?.linhas)) {
          const porOrdem = new Map<number, { ordem: number; nome: string; cpf: string | null }>();
          for (const e of data.elenco!) {
            porOrdem.set(e.ordem, {
              ordem: e.ordem,
              nome: e.nome,
              cpf: e.cpf ? String(e.cpf).replace(/\D+/g, "").slice(0, 11) : null,
            });
          }
          alunas = parsed.linhas.map((l: any) => {
            const ord = Number(l?.elenco_ordem);
            const ref = Number.isFinite(ord) ? porOrdem.get(ord) : undefined;
            const num = Number(l?.num_linha ?? ord);
            const conf = Number.isFinite(Number(l?.confianca)) ? Number(l.confianca) : 0.7;
            return {
              num: Number.isFinite(num) ? num : null,
              nome: ref?.nome ?? null,
              cpf: ref?.cpf ?? null,
              elenco_ordem: Number.isFinite(ord) ? ord : null,
              frequencia_sim: !!l?.frequencia_sim,
              lanche_sim: !!l?.lanche_sim,
              assinatura_presente: !!l?.assinatura_presente,
              legivel: ref != null,
              confianca: Math.max(0, Math.min(1, conf)),
            };
          });
        } else {
          alunas = Array.isArray(parsed?.alunas) ? parsed.alunas : [];
        }
        for (const a of alunas) {
          a.cpf = a.cpf ? normalizeCpfDigits(String(a.cpf)) : null;
          if (a.cpf && a.cpf.length !== 11) a.cpf = null;
          if (typeof a.confianca !== "number") a.confianca = 0.7;
        }
        await admin.from("ia_logs_uso").insert({
          processo: "leitura_lista_presenca",
          provedor: String(prov.provedor),
          modelo,
          tokens_entrada: r.tokens_entrada,
          tokens_saida: r.tokens_saida,
          sucesso: true,
          erro: null,
        });
        return {
          cabecalho: parsed?.cabecalho ?? {},
          alunas,
          observacoes: Array.isArray(parsed?.observacoes) ? parsed.observacoes : [],
          provedor: String(prov.provedor),
          modelo,
          tokens: r.tokens_entrada + r.tokens_saida,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("ia_logs_uso").insert({
          processo: "leitura_lista_presenca",
          provedor: String(prov.provedor),
          modelo,
          tokens_entrada: 0,
          tokens_saida: 0,
          sucesso: false,
          erro: msg.slice(0, 500),
        });
        if (!primeiroErro) primeiroErro = `${prov.provedor}: ${msg}`;
      }
    }
    throw new Error(`Nenhum provedor conseguiu processar as imagens. Primeiro erro: ${primeiroErro ?? "sem provedores com api_key"}`);
  });

// -----------------------------------------------------------------------------
// Roteador de VISÃO reutilizável (mesmo padrão de executarAiRouter, para imagens).
// -----------------------------------------------------------------------------

export async function executarVisaoRouter(input: {
  admin: any;
  processo: string;
  prompt: string;
  imagens: ImagemInput[];
  defaults?: { max_tokens?: number };
}): Promise<{ content: string; provedor: string; modelo: string; tokens_entrada: number; tokens_saida: number; fallback_de?: string }> {
  const { admin, processo, prompt, imagens } = input;
  const defs = input.defaults ?? {};

  const { data: politica } = await admin
    .from("ia_politicas")
    .select("*")
    .eq("processo", processo)
    .maybeSingle();
  const provedorPreferido = (politica?.provedor_preferido as string | null) ?? null;
  const maxTokens = (politica?.max_tokens as number | null) ?? defs.max_tokens ?? 1024;
  const usarFallback = politica?.usar_fallback !== false;

  const { data: provedores } = await admin
    .from("ia_provedores")
    .select("*")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });
  const lista = (provedores ?? []) as any[];
  if (!lista.length) throw new Error("Nenhum provedor de IA ativo. Configure em Configurações > IA.");
  const ordenados = [
    ...lista.filter((p) => p.provedor === provedorPreferido),
    ...lista.filter((p) => p.provedor !== provedorPreferido),
  ];

  let primeiroErro: string | null = null;
  let fallbackDe: string | undefined;
  for (const prov of ordenados) {
    if (!prov.api_key || !String(prov.api_key).trim()) continue;
    const modelo = prov.modelo_padrao || (Array.isArray(prov.modelos_disponiveis) ? prov.modelos_disponiveis[0] : "") || "";
    if (!modelo) continue;
    const codigo = String(prov.provedor);
    const tipo = selecionarChamador(codigo, prov.base_url);
    const base = { base_url: prov.base_url, api_key: prov.api_key, modelo, prompt, imagens, max_tokens: maxTokens };
    try {
      const r =
        tipo === "gemini" ? await chamarGeminiVision(base)
        : tipo === "anthropic" ? await chamarAnthropicVision(base)
        : await chamarOpenAICompatVision(base);
      await admin.from("ia_logs_uso").insert({
        processo, provedor: codigo, modelo,
        tokens_entrada: r.tokens_entrada, tokens_saida: r.tokens_saida,
        sucesso: true, erro: null,
      });
      return {
        content: r.content,
        provedor: codigo,
        modelo,
        tokens_entrada: r.tokens_entrada,
        tokens_saida: r.tokens_saida,
        ...(fallbackDe ? { fallback_de: fallbackDe } : {}),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("ia_logs_uso").insert({
        processo, provedor: codigo, modelo,
        tokens_entrada: 0, tokens_saida: 0,
        sucesso: false, erro: msg.slice(0, 500),
      });
      if (!primeiroErro) primeiroErro = `${codigo}: ${msg}`;
      if (!usarFallback) break;
      if (!fallbackDe) fallbackDe = codigo;
    }
  }
  throw new Error(`Nenhum provedor de visão conseguiu processar. Primeiro erro: ${primeiroErro ?? "sem provedores com api_key"}`);
}

// -----------------------------------------------------------------------------
// Roteador de TRANSCRIÇÃO (Whisper via OpenAI-compat). Percorre provedores
// OpenAI-compatíveis ativos (OpenAI, Groq, OpenRouter etc.); pula Gemini/Anthropic.
// -----------------------------------------------------------------------------

function modeloTranscricaoFor(codigo: string, baseUrl?: string | null, modelosDisponiveis?: unknown): string {
  // 1) tenta encontrar um modelo whisper/transcribe na lista do provedor.
  const lista = Array.isArray(modelosDisponiveis) ? (modelosDisponiveis as string[]) : [];
  const achado = lista.find((m) => /whisper|transcribe/i.test(m));
  if (achado) return achado;
  // 2) mapa por provedor.
  const c = (codigo || "").toLowerCase();
  const b = (baseUrl || "").toLowerCase();
  if (c.includes("groq") || b.includes("groq")) return "whisper-large-v3-turbo";
  if (c.includes("openai") || b.includes("api.openai.com")) return "gpt-4o-mini-transcribe";
  // 3) fallback genérico OpenAI-compat.
  return "whisper-1";
}

export async function executarTranscricaoRouter(input: {
  admin: any;
  processo: string;
  file: Blob | File;
  filename: string;
  contentType: string;
}): Promise<{ text: string; provedor: string; modelo: string }> {
  const { admin, processo, file, filename, contentType } = input;

  const { data: politica } = await admin
    .from("ia_politicas")
    .select("*")
    .eq("processo", processo)
    .maybeSingle();
  const provedorPreferido = (politica?.provedor_preferido as string | null) ?? null;
  const usarFallback = politica?.usar_fallback !== false;

  const { data: provedores } = await admin
    .from("ia_provedores")
    .select("*")
    .eq("ativo", true)
    .order("prioridade", { ascending: true });
  const lista = (provedores ?? []) as any[];
  if (!lista.length) throw new Error("Nenhum provedor de IA ativo. Configure em Configurações > IA.");

  // Só provedores OpenAI-compat suportam Whisper.
  const compat = lista.filter((p) => selecionarChamador(String(p.provedor), p.base_url) === "openai_compat");
  if (!compat.length) {
    throw new Error(
      "Nenhum provedor com suporte a transcrição (Whisper) está ativo. " +
      "Ative um provedor OpenAI-compat (OpenAI, Groq, OpenRouter) em Configurações > IA.",
    );
  }
  const ordenados = [
    ...compat.filter((p) => p.provedor === provedorPreferido),
    ...compat.filter((p) => p.provedor !== provedorPreferido),
  ];

  let primeiroErro: string | null = null;
  for (const prov of ordenados) {
    const apiKey = String(prov.api_key ?? "").replace(/[\r\n\t]/g, "").trim();
    if (!apiKey) continue;
    const baseUrl = String(prov.base_url ?? "").trim();
    if (!baseUrl) continue;
    const modelo = modeloTranscricaoFor(String(prov.provedor), baseUrl, prov.modelos_disponiveis);
    const codigo = String(prov.provedor);

    try {
      const url = `${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
      const fd = new FormData();
      fd.append("model", modelo);
      // Envolve em File novo garantindo o content-type correto.
      const asFile = file instanceof File
        ? file
        : new File([file], filename, { type: contentType });
      fd.append("file", asFile, filename);
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
      let body: any;
      try { body = JSON.parse(txt); } catch { body = { text: txt }; }
      const text = String(body?.text ?? "").trim();
      await admin.from("ia_logs_uso").insert({
        processo, provedor: codigo, modelo,
        tokens_entrada: body?.usage?.input_tokens ?? 0,
        tokens_saida: body?.usage?.output_tokens ?? 0,
        sucesso: true, erro: null,
      });
      return { text, provedor: codigo, modelo };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("ia_logs_uso").insert({
        processo, provedor: codigo, modelo,
        tokens_entrada: 0, tokens_saida: 0,
        sucesso: false, erro: msg.slice(0, 500),
      });
      if (!primeiroErro) primeiroErro = `${codigo}: ${msg}`;
      if (!usarFallback) break;
    }
  }
  throw new Error(`Nenhum provedor de transcrição funcionou. Primeiro erro: ${primeiroErro ?? "sem provedores utilizáveis"}`);
}