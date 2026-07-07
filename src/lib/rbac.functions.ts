import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProjetoIdSchema = z.string().uuid();
const RoleV2Enum = z.enum([
  "admin",
  "coordenador",
  "instrutor",
  "financeiro",
  "parceiro_mte",
  "captacao",
]);

async function assertCoordenadorGeral(
  supabase: any,
  userId: string,
  projetoId: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("projeto_id", projetoId)
    .eq("role", "coordenador_geral")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas coordenação geral pode executar esta ação.");
}

/* ============ MATRIZ DE PERMISSÕES ============ */

export const listarPermissoesMatriz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("permissoes_papel")
      .select("role, modulo, pode_ver, pode_criar, pode_editar, pode_excluir")
      .order("role")
      .order("modulo");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const atualizarPermissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      role: RoleV2Enum,
      modulo: z.string().min(1),
      pode_ver: z.boolean(),
      pode_criar: z.boolean(),
      pode_editar: z.boolean(),
      pode_excluir: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("permissoes_papel")
      .update({
        pode_ver: data.pode_ver,
        pode_criar: data.pode_criar,
        pode_editar: data.pode_editar,
        pode_excluir: data.pode_excluir,
      })
      .eq("role", data.role)
      .eq("modulo", data.modulo);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ INSTRUTOR ↔ TURMAS ============ */

export const listarTurmasDoProjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projetoId: ProjetoIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("turmas")
      .select("id, nome, codigo")
      .eq("projeto_id", data.projetoId)
      .order("nome");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listarInstrutorTurmas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projetoId: ProjetoIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: vinc, error } = await admin
      .from("instrutor_turmas")
      .select("id, user_id, turma_id, projeto_id, created_at")
      .eq("projeto_id", data.projetoId);
    if (error) throw new Error(error.message);
    return vinc ?? [];
  });

export const vincularInstrutorTurma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      userId: z.string().uuid(),
      turmaId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("instrutor_turmas").upsert(
      {
        user_id: data.userId,
        turma_id: data.turmaId,
        projeto_id: data.projetoId,
      },
      { onConflict: "user_id,turma_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const desvincularInstrutorTurma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      userId: z.string().uuid(),
      turmaId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("instrutor_turmas")
      .delete()
      .eq("user_id", data.userId)
      .eq("turma_id", data.turmaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });