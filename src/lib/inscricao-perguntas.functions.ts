/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAPEIS_COORDENACAO, requirePapel } from "@/lib/rbac-guard";
export const PerguntaCustomizadaSchema = z.object({
  id: z.string().uuid().optional(),
  chave: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(2),
  tipo: z.enum([
    "texto_curto",
    "texto_longo",
    "selecao_unica",
    "selecao_multipla",
    "sim_nao",
    "numero",
    "data",
  ]),
  opcoes: z.array(z.string().trim()).default([]),
  obrigatoria: z.boolean().default(false),
  ajuda: z.string().nullable().optional(),
  ativo: z.boolean().default(true),
  ordem: z.number().int().default(0),
});
export type PerguntaCustomizada = z.infer<typeof PerguntaCustomizadaSchema>;
function mapRow(row: any): PerguntaCustomizada {
  return {
    id: row.id,
    chave: row.chave,
    label: row.label,
    tipo: row.tipo,
    opcoes: Array.isArray(row.opcoes) ? row.opcoes : [],
    obrigatoria: !!row.obrigatoria,
    ajuda: row.ajuda ?? null,
    ativo: !!row.ativo,
    ordem: Number(row.ordem ?? 0),
  };
}
export const listarInscricaoPerguntasPublicas = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await getSupabaseAdmin()
      .from("inscricao_perguntas_customizadas")
      .select("*")
      .eq("ativo", true)
      .order("ordem");
    if (error) return [];
    return (data ?? []).map(mapRow);
  },
);
export const listarInscricaoPerguntasAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await getSupabaseAdmin()
      .from("inscricao_perguntas_customizadas")
      .select("*")
      .order("ordem");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  });
export const salvarInscricaoPergunta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => PerguntaCustomizadaSchema.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      chave: data.chave,
      label: data.label,
      tipo: data.tipo,
      opcoes: data.opcoes,
      obrigatoria: data.obrigatoria,
      ajuda: data.ajuda ?? null,
      ativo: data.ativo,
      ordem: data.ordem,
      atualizado_em: new Date().toISOString(),
    };
    const q = data.id
      ? getSupabaseAdmin()
          .from("inscricao_perguntas_customizadas")
          .update(payload)
          .eq("id", data.id)
      : getSupabaseAdmin().from("inscricao_perguntas_customizadas").insert(payload);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const removerInscricaoPergunta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await getSupabaseAdmin()
      .from("inscricao_perguntas_customizadas")
      .update({ ativo: false, atualizado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reordenarInscricaoPerguntas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const [ordem, id] of data.ids.entries()) {
      const { error } = await getSupabaseAdmin()
        .from("inscricao_perguntas_customizadas")
        .update({ ordem, atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
