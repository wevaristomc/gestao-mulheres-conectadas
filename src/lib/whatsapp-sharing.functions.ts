import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const VISIBILIDADES = ["privado", "compartilhado_todos", "compartilhado_selecionados"] as const;
export type Visibilidade = (typeof VISIBILIDADES)[number];

/**
 * Atualiza visibilidade + compartilhados de uma importação. Somente o dono
 * (owner_id) ou coordenação geral/administrativo podem alterar (validado
 * pelas policies RLS após aplicar a migração).
 */
export const atualizarVisibilidadeImportacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      importacaoId: z.string().uuid(),
      visibilidade: z.enum(VISIBILIDADES),
      userIds: z.array(z.string().uuid()).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { error: e1 } = await sb
      .from("wa_importacoes")
      .update({ visibilidade: data.visibilidade })
      .eq("id", data.importacaoId);
    if (e1) throw new Error(e1.message);

    if (data.visibilidade === "compartilhado_selecionados") {
      const alvo = new Set(data.userIds ?? []);
      const { data: atuais, error: e2 } = await sb
        .from("wa_compartilhamentos")
        .select("user_id")
        .eq("importacao_id", data.importacaoId);
      if (e2) throw new Error(e2.message);
      const atuaisSet = new Set(((atuais ?? []) as { user_id: string }[]).map((x) => x.user_id));
      const adicionar = Array.from(alvo).filter((u) => !atuaisSet.has(u));
      const remover = Array.from(atuaisSet).filter((u) => !alvo.has(u));

      if (adicionar.length) {
        const { error } = await sb.from("wa_compartilhamentos").insert(
          adicionar.map((u) => ({ importacao_id: data.importacaoId, user_id: u })),
        );
        if (error) throw new Error(error.message);
      }
      if (remover.length) {
        const { error } = await sb
          .from("wa_compartilhamentos")
          .delete()
          .eq("importacao_id", data.importacaoId)
          .in("user_id", remover);
        if (error) throw new Error(error.message);
      }
    } else {
      // outras visibilidades não usam a lista — limpa por higiene
      await sb.from("wa_compartilhamentos").delete().eq("importacao_id", data.importacaoId);
    }

    return { ok: true };
  });

/**
 * Lista os user_ids que têm acesso individual à importação
 * (visibilidade = compartilhado_selecionados).
 */
export const listarCompartilhamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ importacaoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("wa_compartilhamentos")
      .select("user_id")
      .eq("importacao_id", data.importacaoId);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  });