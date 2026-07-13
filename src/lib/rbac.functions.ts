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
      .select("*")
      .eq("projeto_id", data.projetoId)
      .order("codigo_turma", { ascending: true, nullsFirst: false });
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

    const enriquecerComTurma = async (rows: Record<string, unknown>[]) => {
      const turmaIds = Array.from(
        new Set(rows.map((r) => String(r.turma_id ?? "")).filter(Boolean)),
      );
      if (turmaIds.length === 0) return rows;

      let turmasRes = await admin
        .from("turmas")
        .select("id, codigo_turma, codigo, nome, nome_curso")
        .in("id", turmaIds);

      if (turmasRes.error && /column .*nome_curso.* does not exist/i.test(turmasRes.error.message || "")) {
        turmasRes = await admin
          .from("turmas")
          .select("id, codigo_turma, codigo, nome")
          .in("id", turmaIds);
      }

      if (turmasRes.error) return rows;

      const turmasById = new Map(
        ((turmasRes.data ?? []) as Record<string, unknown>[]).map((t) => [String(t.id), t]),
      );

      return rows.map((r) => {
        const turma = turmasById.get(String(r.turma_id ?? ""));
        if (!turma) return r;
        return {
          ...r,
          turma_codigo_turma: turma.codigo_turma ?? null,
          turma_codigo: turma.codigo ?? null,
          turma_nome: turma.nome ?? null,
          turma_nome_curso: turma.nome_curso ?? null,
        };
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