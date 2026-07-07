import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  const url = `${params.base_url.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.api_key}`,
    },
    body: JSON.stringify({
      model: params.modelo,
      messages: params.mensagens,
      max_tokens: params.max_tokens,
      temperature: params.temperatura,
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
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
  const url = `${params.base_url.replace(/\/+$/, "")}/models/${params.modelo}:generateContent?key=${encodeURIComponent(params.api_key)}`;
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
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
  const url = `${params.base_url.replace(/\/+$/, "")}/messages`;
  const system = params.mensagens.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = params.mensagens
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.api_key,
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
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

function selecionarChamador(codigo: string) {
  const c = codigo.toLowerCase();
  if (c.includes("gemini")) return "gemini";
  if (c.includes("anthropic") || c.includes("claude")) return "anthropic";
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
}): Promise<CallResult & { fallback_de?: string }> {
  const { admin, processo, mensagens } = input;

  // Política — se não houver, usa defaults sensatos.
  const { data: politicaRow } = await admin
    .from("ia_politicas")
    .select("*")
    .eq("processo", processo)
    .maybeSingle();

  const provedorPreferido = (politicaRow?.provedor_preferido as string | null) ?? null;
  const maxTokens = (politicaRow?.max_tokens as number | null) ?? 1024;
  const temperatura = (politicaRow?.temperatura as number | null) ?? 0.4;
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
    const tipo = selecionarChamador(codigo);

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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
    if (data.api_key !== undefined && data.api_key !== "") payload.api_key = data.api_key;
    if (data.modelo_padrao !== undefined) payload.modelo_padrao = data.modelo_padrao;
    if (data.ativo !== undefined) payload.ativo = data.ativo;
    if (data.prioridade !== undefined) payload.prioridade = data.prioridade;
    if (Object.keys(payload).length === 0) return { ok: true };
    const { error } = await admin.from("ia_provedores").update(payload).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testarProvedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const tipo = selecionarChamador(String(prov.provedor));
    const base = { base_url: prov.base_url, api_key: prov.api_key, modelo, mensagens: [{ role: "user" as const, content: "Responda apenas: OK" }], max_tokens: 20, temperatura: 0 };
    const r = tipo === "gemini" ? await chamarGemini(base)
      : tipo === "anthropic" ? await chamarAnthropic(base)
      : await chamarOpenAICompat(base);
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await checarAdmin(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("ia_politicas").select("*").order("processo");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const salvarPolitica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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