import { createClient } from "@supabase/supabase-js";

// Hardcoded no projeto real. O Lovable Cloud regrava o .env para o projeto
// gerenciado a cada build, então ignoramos import.meta.env para URL/chave.
const SUPABASE_URL = "https://yqvocpnvunaprpmhlswn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxdm9jcG52dW5hcHJwbWhsc3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDk4MDIsImV4cCI6MjA5ODIyNTgwMn0.L8FQRfI2M7RAGdTPsyNvHWXEWqmywtfHKP-65eyljwE";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  },
);