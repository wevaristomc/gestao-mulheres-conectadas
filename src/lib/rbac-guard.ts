/**
 * Helpers de checagem de papel/escopo dentro de server functions.
 *
 * PORQUÊ: várias server fns usam o admin client (service_role) para escrever
 * ou consolidar dados — o admin IGNORA RLS. Sem uma checagem interna, um
 * usuário "professor" autenticado consegue chamar qualquer server fn e ver
 * dados do projeto inteiro. Estes helpers rodam ANTES de qualquer query
 * privilegiada e usam sempre o cliente do usuário (context.supabase, RLS
 * como esse usuário) para descobrir o papel real.
 */

import type { AppRole } from "@/lib/role-access";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Middleware para server functions que exige o usuário autenticado e
 * checa se o papel dele está no conjunto informado. Deve ser usado APÓS
 * `requireSupabaseAuth`. Ex.:
 *
 *   .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
 *
 * Se `requireSupabaseAuth` não estiver na cadeia, cria seu próprio cliente
 * (fail-closed com 401 se não houver bearer).
 */
export function requirePapel(papeis: AppRole[]) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }: any) => {
    let supabase = context?.supabase;
    let userId = context?.userId as string | undefined;
    if (!supabase || !userId) {
      const request = getRequest();
      const authHeader = request.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        throw new Response("Unauthorized", { status: 401 });
      }
      const token = authHeader.slice("Bearer ".length);
      const url = "https://yqvocpnvunaprpmhlswn.supabase.co";
      const key =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxdm9jcG52dW5hcHJwbWhsc3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDk4MDIsImV4cCI6MjA5ODIyNTgwMn0.L8FQRfI2M7RAGdTPsyNvHWXEWqmywtfHKP-65eyljwE";
      supabase = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
      userId = data.user.id;
    }
    const papel = await papelDoUsuario(supabase, userId!);
    if (!papel || !papeis.includes(papel)) {
      throw new Error("Sem permissão para esta ação");
    }
    return next({ context: { supabase, userId, papel } });
  });
}

/** Fetch o papel de maior privilégio do usuário atual (via user_roles). */
export async function papelDoUsuario(
  supabase: any,
  userId: string,
): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao ler papel: ${error.message}`);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  const PRIORIDADE: AppRole[] = [
    "coordenador_geral",
    "gestor_financeiro",
    "coordenador_pedagogico",
    "administrativo",
    "professor",
    "auxiliar_pedagogico",
  ];
  for (const r of PRIORIDADE) {
    if (roles.includes(r)) return r;
  }
  return null;
}

/** Erro plano usado pelas checagens (createServerFn propaga a mensagem). */
export function forbidden(msg = "Sem permissão para esta ação"): never {
  throw new Error(msg);
}

/** Exige que o papel do usuário esteja no conjunto informado. */
export async function exigirPapel(
  supabase: any,
  userId: string,
  papeis: AppRole[],
  msg = "Sem permissão para esta ação",
): Promise<AppRole> {
  const papel = await papelDoUsuario(supabase, userId);
  if (!papel || !papeis.includes(papel)) forbidden(msg);
  return papel!;
}

/** Retorna as turmas vinculadas ao usuário via instrutor_turmas. */
export async function turmasDoUsuario(
  supabase: any,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("instrutor_turmas")
    .select("turma_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao ler instrutor_turmas: ${error.message}`);
  return ((data ?? []) as { turma_id: string }[]).map((r) => r.turma_id);
}

/** Garante que o usuário é dono (via instrutor_turmas) da turma informada. */
export async function exigirTurmaDoUsuario(
  supabase: any,
  userId: string,
  turmaId: string,
): Promise<void> {
  const turmas = await turmasDoUsuario(supabase, userId);
  if (!turmas.includes(turmaId)) {
    forbidden("Turma fora do escopo do usuário");
  }
}

/* Conjuntos padrão de papéis reutilizados em várias fns. */
export const PAPEIS_COORDENACAO: AppRole[] = [
  "coordenador_geral",
  "coordenador_pedagogico",
  "administrativo",
];
export const PAPEIS_COORDENACAO_E_FINANCEIRO: AppRole[] = [
  ...PAPEIS_COORDENACAO,
  "gestor_financeiro",
];
export const PAPEIS_FINANCEIROS: AppRole[] = [
  "coordenador_geral",
  "administrativo",
  "gestor_financeiro",
];
export const PAPEIS_INSTRUTORES: AppRole[] = [
  "professor",
  "auxiliar_pedagogico",
];