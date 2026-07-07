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
    return next(
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
  },
);