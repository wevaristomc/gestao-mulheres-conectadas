/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAPEIS_COORDENACAO, requirePapel } from "@/lib/rbac-guard";

const UUID = z.string().uuid();
const NOME = z.string().trim().min(2, "Informe o nome.").max(120);
const CONTEXTO = z.string().trim().min(2, "Informe o contexto.").max(240);

export type LandingDepoimento = {
  id: string;
  nome: string;
  contexto: string;
  videoPath: string;
  videoUrl: string;
  ordem: number;
  ativo: boolean;
};

function tabelaNaoExiste(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    /42P01|PGRST205|landing_depoimentos|schema cache/i.test(
      `${error.code ?? ""} ${error.message ?? ""}`,
    )
  );
}

function urlPublica(admin: any, path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith("/")) return path;
  return admin.storage.from("landing").getPublicUrl(path).data.publicUrl;
}

async function buscar(admin: any, somenteAtivos: boolean): Promise<LandingDepoimento[]> {
  let query = admin
    .from("landing_depoimentos")
    .select("id, nome, contexto, video_path, ordem, ativo")
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });
  if (somenteAtivos) query = query.eq("ativo", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    nome: row.nome,
    contexto: row.contexto,
    videoPath: row.video_path,
    videoUrl: urlPublica(admin, row.video_path),
    ordem: Number(row.ordem ?? 0),
    ativo: !!row.ativo,
  }));
}

export const listarLandingDepoimentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingDepoimento[]> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    try {
      return await buscar(admin, true);
    } catch (error) {
      if (tabelaNaoExiste(error as any)) return [];
      throw new Error("Não foi possível carregar os depoimentos.");
    }
  },
);

export const listarLandingDepoimentosAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async (): Promise<LandingDepoimento[]> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    try {
      return await buscar(admin, false);
    } catch (error) {
      if (tabelaNaoExiste(error as any)) {
        throw new Error("A migração de depoimentos da landing ainda não foi aplicada.");
      }
      throw new Error((error as Error).message);
    }
  });

export const criarLandingDepoimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({ nome: NOME, contexto: CONTEXTO, videoPath: z.string().trim().min(1).max(500) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data: ultimo, error: ordemError } = await admin
      .from("landing_depoimentos")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ordemError) throw new Error(ordemError.message);
    const { data: row, error } = await admin
      .from("landing_depoimentos")
      .insert({
        nome: data.nome,
        contexto: data.contexto,
        video_path: data.videoPath,
        ordem: Number(ultimo?.ordem ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const atualizarLandingDepoimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z.object({ id: UUID, nome: NOME, contexto: CONTEXTO }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { error } = await admin
      .from("landing_depoimentos")
      .update({ nome: data.nome, contexto: data.contexto, atualizado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const alternarLandingDepoimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ id: UUID, ativo: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { error } = await admin
      .from("landing_depoimentos")
      .update({ ativo: data.ativo, atualizado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reordenarLandingDepoimentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ ids: z.array(UUID).min(1).max(100) }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const resultados = await Promise.all(
      data.ids.map((id, indice) =>
        admin
          .from("landing_depoimentos")
          .update({ ordem: indice + 1, atualizado_em: new Date().toISOString() })
          .eq("id", id),
      ),
    );
    const falha = resultados.find((resultado) => resultado.error);
    if (falha?.error) throw new Error(falha.error.message);
    return { ok: true };
  });

export const excluirLandingDepoimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ id: UUID }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data: row, error: readError } = await admin
      .from("landing_depoimentos")
      .select("video_path")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !row) throw new Error("Depoimento não encontrado.");
    const { error } = await admin.from("landing_depoimentos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (
      row.video_path &&
      !row.video_path.startsWith("/") &&
      !/^https?:\/\//i.test(row.video_path)
    ) {
      await admin.storage.from("landing").remove([row.video_path]);
    }
    return { ok: true };
  });
