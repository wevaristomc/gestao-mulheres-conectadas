import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_ROLES } from "@/lib/role-access";

const RoleEnum = z.enum(APP_ROLES);
const ProjetoIdSchema = z.string().uuid();

async function assertCoordenadorGeral(
  supabase: ReturnType<typeof requireSupabaseAuth> extends never ? never : any,
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

/* ============ LISTAR USUÁRIOS DO PROJETO ============ */
export const listarUsuariosProjeto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projetoId: ProjetoIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: roles, error: rolesErr } = await admin
      .from("user_roles")
      .select("user_id, role, projeto_id")
      .eq("projeto_id", data.projetoId);
    if (rolesErr) throw new Error(rolesErr.message);

    const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (userIds.length === 0) return [] as Array<{
      id: string; email: string; nome: string | null; role: string; last_sign_in_at: string | null;
    }>;

    // Auth Admin não tem getByIds; pagina e filtra.
    const matched: Record<string, { email: string; nome: string | null; last_sign_in_at: string | null }> = {};
    let page = 1;
    while (Object.keys(matched).length < userIds.length && page < 50) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw new Error(listErr.message);
      for (const u of list.users) {
        if (userIds.includes(u.id)) {
          matched[u.id] = {
            email: u.email ?? "",
            nome: (u.user_metadata?.nome as string | undefined) ?? null,
            last_sign_in_at: u.last_sign_in_at ?? null,
          };
        }
      }
      if (list.users.length < 200) break;
      page += 1;
    }

    return (roles ?? []).map((r: any) => ({
      id: r.user_id,
      role: r.role,
      email: matched[r.user_id]?.email ?? "(usuário removido)",
      nome: matched[r.user_id]?.nome ?? null,
      last_sign_in_at: matched[r.user_id]?.last_sign_in_at ?? null,
    }));
  });

/* ============ CRIAR USUÁRIO ============ */
export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      email: z.string().email(),
      nome: z.string().min(2),
      role: RoleEnum,
      senhaProvisoria: z.string().min(8),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.senhaProvisoria,
      email_confirm: true,
      user_metadata: { nome: data.nome, must_change_password: true },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Falha ao criar usuário");
    }
    const { error: roleErr } = await admin.from("user_roles").insert({
      user_id: created.user.id,
      projeto_id: data.projetoId,
      role: data.role,
    });
    if (roleErr) {
      // rollback do auth user
      await admin.auth.admin.deleteUser(created.user.id);
      throw new Error(roleErr.message);
    }
    return { id: created.user.id };
  });

/* ============ ATUALIZAR PAPEL ============ */
export const atualizarPapel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      userId: z.string().uuid(),
      role: RoleEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", data.userId)
      .eq("projeto_id", data.projetoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ REMOVER ACESSO ============ */
export const removerAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      userId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover seu próprio acesso.");
    }
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("projeto_id", data.projetoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ RESETAR SENHA PROVISÓRIA ============ */
export const resetarSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      userId: z.string().uuid(),
      novaSenha: z.string().min(8),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.novaSenha,
      user_metadata: { must_change_password: true },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });