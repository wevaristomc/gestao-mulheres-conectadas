import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

/**
 * functionMiddleware que anexa o bearer token Supabase a chamadas createServerFn.
 * Roda no client antes de cada RPC.
 */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return next();
    return next({
      sendContext: {},
      headers: { Authorization: `Bearer ${token}` },
    });
  },
);