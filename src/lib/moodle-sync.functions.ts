// Server functions auxiliares para sincronizar contatos (email/telefone)
// e listar professores identificados no último dump AVA. Não altera o
// pipeline de import; usa apenas o que já foi persistido em ava_users
// e ava_importacoes.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCoordenadorGeral(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "coordenador_geral")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas a coordenação geral pode executar esta ação.");
}

/** Retropreenche beneficiarias.email a partir de ava_users, apenas quando vazio. */
export const sincronizarEmailsBeneficiariasFromAva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // Busca beneficiárias sem email + com id conhecido
    const benefQ = await admin
      .from("beneficiarias")
      .select("id, email, telefone")
      .or("email.is.null,email.eq.");
    if (benefQ.error) throw new Error(benefQ.error.message);
    const benefIds = ((benefQ.data ?? []) as Array<{ id: string; email: string | null; telefone: string | null }>);
    if (benefIds.length === 0) return { atualizadas: 0, verificadas: 0 };

    // Puxa emails do AVA já vinculados por beneficiaria_id
    const idsChunk = benefIds.map((b) => b.id);
    const emailByBenefId = new Map<string, string>();
    for (let i = 0; i < idsChunk.length; i += 500) {
      const slice = idsChunk.slice(i, i + 500);
      const q = await admin
        .from("ava_users")
        .select("beneficiaria_id, email")
        .in("beneficiaria_id", slice)
        .not("email", "is", null);
      if (q.error) throw new Error(q.error.message);
      for (const u of (q.data ?? []) as Array<{ beneficiaria_id: string; email: string | null }>) {
        if (!u.email || !u.email.includes("@")) continue;
        if (!emailByBenefId.has(u.beneficiaria_id)) emailByBenefId.set(u.beneficiaria_id, u.email);
      }
    }

    let atualizadas = 0;
    for (const b of benefIds) {
      if (b.email && b.email.trim()) continue;
      const email = emailByBenefId.get(b.id);
      if (!email) continue;
      const { error } = await admin.from("beneficiarias").update({ email }).eq("id", b.id);
      if (!error) atualizadas += 1;
    }
    return { atualizadas, verificadas: benefIds.length };
  });

/** Retorna a lista de professores capturada no último import AVA (do campo resumo). */
export const listarProfessoresUltimoAva = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCoordenadorGeral(context.supabase, context.userId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const q = await admin
      .from("ava_importacoes")
      .select("id, criado_em, resumo")
      .eq("status", "concluido")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(q.error.message);
    const resumo = (q.data?.resumo ?? {}) as Record<string, unknown>;
    const professores = Array.isArray(resumo.professores) ? resumo.professores : [];
    return {
      importacao_id: (q.data?.id as string | undefined) ?? null,
      criado_em: (q.data?.criado_em as string | undefined) ?? null,
      professores,
    };
  });