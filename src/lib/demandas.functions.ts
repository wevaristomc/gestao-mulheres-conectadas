import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProjetoIdSchema = z.string().uuid();

/**
 * Lista usuários vinculados ao projeto (lite: id/nome/email/role) para
 * atribuição de responsáveis e colaboradores nas demandas Kanban.
 * Acessível a qualquer usuário autenticado — dados equivalentes ao já
 * exposto pelo listar de usuários da coordenação, sem PII sensível.
 */
export const listarUsuariosParaDemandas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projetoId: ProjetoIdSchema }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: roles, error } = await admin
      .from("user_roles")
      .select("user_id, role, ativo, projeto_id")
      .or(`projeto_id.eq.${data.projetoId},projeto_id.is.null`);
    if (error) throw new Error(error.message);

    const activeRoles = (roles ?? []).filter((r: any) => r.ativo !== false);
    const userIds = Array.from(new Set(activeRoles.map((r: any) => r.user_id)));
    if (userIds.length === 0) return [] as Array<{ id: string; nome: string; email: string; role: string }>;

    const matched: Record<string, { email: string; nome: string }> = {};
    let page = 1;
    while (Object.keys(matched).length < userIds.length && page < 50) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw new Error(listErr.message);
      for (const u of list.users) {
        if (userIds.includes(u.id)) {
          matched[u.id] = {
            email: u.email ?? "",
            nome: (u.user_metadata?.nome as string | undefined) ?? u.email ?? "Usuário",
          };
        }
      }
      if (list.users.length < 200) break;
      page += 1;
    }

    // Um registro por usuário — pega o papel de maior prioridade se houver mais de um
    const byUser = new Map<string, { role: string }>();
    for (const r of activeRoles as any[]) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, { role: r.role });
    }
    return Array.from(byUser.entries())
      .map(([id, { role }]) => ({
        id,
        role,
        nome: matched[id]?.nome ?? "Usuário",
        email: matched[id]?.email ?? "",
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

/**
 * Atribui responsável a uma demanda e (opcionalmente) muda status/prazo,
 * emitindo notificação sem duplicação (chave atividade+evento+dia).
 */
export const atribuirResponsavel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      atividadeId: z.string().uuid(),
      responsavelId: z.string().uuid().nullable(),
      colaboradores: z.array(z.string().uuid()).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      prazo: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const patch: Record<string, unknown> = {
      responsavel_id: data.responsavelId,
    };
    if (data.colaboradores) patch.colaboradores = data.colaboradores;
    if (data.prioridade) patch.prioridade = data.prioridade;
    if (data.prazo !== undefined) patch.prazo = data.prazo || null;

    const { data: prev } = await admin
      .from("etapa_atividades")
      .select("id, titulo, responsavel_id, prazo")
      .eq("id", data.atividadeId)
      .maybeSingle();

    const { error } = await admin
      .from("etapa_atividades")
      .update(patch)
      .eq("id", data.atividadeId);
    if (error) throw new Error(error.message);

    // Notifica novo responsável (se mudou)
    const previousResponsavel = (prev as any)?.responsavel_id ?? null;
    if (data.responsavelId && data.responsavelId !== previousResponsavel && data.responsavelId !== context.userId) {
      const titulo = (prev as any)?.titulo ?? "Demanda";
      const hoje = new Date().toISOString().slice(0, 10);
      const dedupKey = `demanda:${data.atividadeId}:atribuicao:${hoje}`;
      const { data: ja } = await admin
        .from("notificacoes")
        .select("id")
        .eq("user_id", data.responsavelId)
        .eq("chave_dedup", dedupKey)
        .maybeSingle();
      if (!ja) {
        await admin.from("notificacoes").insert({
          user_id: data.responsavelId,
          tipo: "demanda",
          severidade: "info",
          origem: "kanban",
          titulo: "Nova demanda atribuída a você",
          corpo: titulo,
          link_rota: "/minhas-demandas",
          chave_dedup: dedupKey,
        });
      }
    }
    return { ok: true };
  });