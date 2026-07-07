import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com SERVICE ROLE — bypassa RLS.
 * USO EXCLUSIVAMENTE SERVIDOR. Nunca importar no client bundle:
 * sempre carregar via `await import("@/integrations/supabase/client.server")`
 * dentro do handler de um createServerFn.
 */
export function getSupabaseAdmin() {
  // Projeto correto hardcoded: process.env.SUPABASE_URL gerenciado aponta
  // para o projeto Lovable Cloud padrão, não para o projeto real.
  const url = "https://yqvocpnvunaprpmhlswn.supabase.co";
  const key = process.env.ADMIN_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "ADMIN_SERVICE_ROLE_KEY ausente. Configure o secret no painel para habilitar operações administrativas.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}