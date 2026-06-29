import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Stub de middleware para server functions autenticadas.
 *
 * Quando a integração oficial do Lovable for ativada (botão verde Supabase),
 * este arquivo é substituído pela versão gerada que valida o bearer token via
 * `auth.getUser()` e injeta { supabase, userId, claims } em context.
 *
 * Por ora, valida apenas a presença do header e cria um cliente com o token
 * do usuário. NÃO use em produção até a integração oficial estar ativa.
 */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next, request }) => {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Response("Unauthorized: No authorization header provided", {
        status: 401,
      });
    }
    const token = authHeader.slice("Bearer ".length);

    const url = process.env.SUPABASE_URL ?? "https://yqvocpnvunaprpmhlswn.supabase.co";
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: data.user,
      },
    });
  },
);