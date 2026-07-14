import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_ROLES } from "@/lib/role-access";
import {
  ensurePermissionMatrix,
  loadPermissionRows,
  normalizeStoredPermissions,
  permissionsForRole,
} from "@/lib/permissions-db";
import { storageRoleForAppRole } from "@/lib/permissions-model";

const ProjetoIdSchema = z.string().uuid();
const RoleEnum = z.enum(APP_ROLES);

type InstrutorTurmaDTO = {
  id: string;
  user_id: string;
  turma_id: string;
  projeto_id: string;
  turma_codigo_turma: string | null;
  turma_codigo: string | null;
  turma_nome: string | null;
  turma_nome_curso: string | null;
};

async function assertCoordenadorGeral(
  supabase: any,
  userId: string,
  projetoId: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, projeto_id")
    .eq("user_id", userId)
    .eq("ativo", true)
    .or(`projeto_id.eq.${projetoId},projeto_id.is.null`)
    .limit(20);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ role: string; projeto_id: string | null }>;
  const projectRows = rows.filter((r) => r.projeto_id === projetoId);
  const allowed = rows.some(
    (r) => r.role === "coordenador_geral" && (r.projeto_id === projetoId || r.projeto_id === null),
  );
  if (!allowed) throw new Error("Apenas coordenação geral pode executar esta ação.");
}

/* ============ MATRIZ DE PERMISSÕES ============ */

export const listarPermissoesMatriz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projetoId: ProjetoIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId, data.projetoId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const rows = await ensurePermissionMatrix(admin);
    return normalizeStoredPermissions(rows);
  });

export const listarPermissoesPapel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ role: RoleEnum }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const rows = await loadPermissionRows(admin);
    return permissionsForRole(rows, data.role);
  });

export const atualizarPermissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projetoId: ProjetoIdSchema,
      role: RoleEnum,
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
    const rows = await loadPermissionRows(admin);
    const availableRoles = Array.from(
      new Set(rows.map((r) => r.role)),
    );
    const storageRole = storageRoleForAppRole(data.role, availableRoles);
    const { error } = await admin
      .from("permissoes_papel")
      .update({
        pode_ver: data.pode_ver,
        pode_criar: data.pode_criar,
        pode_editar: data.pode_editar,
        pode_excluir: data.pode_excluir,
      })
      .eq("role", storageRole)
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
      .select("*")
      .eq("projeto_id", data.projetoId);
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

    const toStringOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

    const enriquecerComTurma = async (rows: Record<string, unknown>[]): Promise<InstrutorTurmaDTO[]> => {
      const turmaIds = Array.from(
        new Set(rows.map((r) => String(r.turma_id ?? "")).filter(Boolean)),
      );
      const base = (turma?: Record<string, unknown>) => (r: Record<string, unknown>): InstrutorTurmaDTO => ({
        id: String(r.id ?? `${r.user_id ?? ""}-${r.turma_id ?? ""}`),
        user_id: String(r.user_id ?? ""),
        turma_id: String(r.turma_id ?? ""),
        projeto_id: String(r.projeto_id ?? data.projetoId),
        turma_codigo_turma: toStringOrNull(turma?.codigo_turma),
        turma_codigo: toStringOrNull(turma?.codigo),
        turma_nome: toStringOrNull(turma?.nome),
        turma_nome_curso: toStringOrNull(turma?.nome_curso),
      });

      if (turmaIds.length === 0) return rows.map((r) => base()(r));

      const turmasRes = await admin
        .from("turmas")
        .select("*")
        .in("id", turmaIds);
      if (turmasRes.error) return rows.map((r) => base()(r));

      const turmasById = new Map(
        ((turmasRes.data ?? []) as Record<string, unknown>[]).map((t) => [String(t.id), t]),
      );

      return rows.map((r) => {
        const turma = turmasById.get(String(r.turma_id ?? ""));
        return base(turma)(r);
      });
    };

    // Tenta primeiro filtrar direto por projeto_id (schema atualizado).
    const direto = await admin
      .from("instrutor_turmas")
      .select("*")
      .eq("projeto_id", data.projetoId);
    if (!direto.error) return enriquecerComTurma((direto.data ?? []) as Record<string, unknown>[]);
    const msg = direto.error.message || "";
    const semColuna = /column .*projeto_id.* does not exist/i.test(msg);
    if (!semColuna) throw new Error(msg);
    // Fallback: schema antigo sem projeto_id em instrutor_turmas.
    // Deriva via turmas do projeto.
    const turmasRes = await admin
      .from("turmas")
      .select("id")
      .eq("projeto_id", data.projetoId);
    if (turmasRes.error) throw new Error(turmasRes.error.message);
    const ids = (turmasRes.data ?? []).map((t: { id: string }) => t.id);
    if (ids.length === 0) return [];
    const vinc = await admin
      .from("instrutor_turmas")
      .select("*")
      .in("turma_id", ids);
    if (vinc.error) throw new Error(vinc.error.message);
    // Preenche projeto_id in-memory para o cliente.
    const rows = (vinc.data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      projeto_id: data.projetoId,
    }));
    return enriquecerComTurma(rows);
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
    // Primeiro tentativa: schema com projeto_id.
    const comProj = await admin.from("instrutor_turmas").upsert(
      {
        user_id: data.userId,
        turma_id: data.turmaId,
        projeto_id: data.projetoId,
      },
      { onConflict: "user_id,turma_id" },
    );
    if (!comProj.error) return { ok: true };
    const msg = comProj.error.message || "";
    if (!/column .*projeto_id.* does not exist/i.test(msg)) {
      throw new Error(msg);
    }
    // Fallback: schema antigo — grava só user_id/turma_id.
    const semProj = await admin.from("instrutor_turmas").upsert(
      { user_id: data.userId, turma_id: data.turmaId },
      { onConflict: "user_id,turma_id" },
    );
    if (semProj.error) throw new Error(semProj.error.message);
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