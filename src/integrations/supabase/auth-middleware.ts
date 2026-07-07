import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
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
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Response("Unauthorized: No authorization header provided", {
        status: 401,
      });
    }
    const token = authHeader.slice("Bearer ".length);

    // Projeto correto hardcoded: o secret gerenciado SUPABASE_URL aponta para
    // o projeto Lovable Cloud padrão, não para o projeto real. Priorizamos os
    // valores fixos abaixo. A anon key é pública (JWT role: anon), sem risco
    // de vazamento.
    const url = "https://yqvocpnvunaprpmhlswn.supabase.co";
    const key =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxdm9jcG52dW5hcHJwbWhsc3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDk4MDIsImV4cCI6MjA5ODIyNTgwMn0.L8FQRfI2M7RAGdTPsyNvHWXEWqmywtfHKP-65eyljwE";

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