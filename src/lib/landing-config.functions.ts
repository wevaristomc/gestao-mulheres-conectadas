/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAPEIS_COORDENACAO, requirePapel } from "@/lib/rbac-guard";

const HERO_VIDEO_PATH = z
  .string()
  .trim()
  .regex(/^hero\/[a-z0-9-]+\.mp4$/i, "Caminho de vídeo inválido.")
  .max(500)
  .nullable();
const HERO_POSTER_PATH = z
  .string()
  .trim()
  .regex(/^hero\/[a-z0-9-]+\.(?:jpe?g|png)$/i, "Caminho de poster inválido.")
  .max(500)
  .nullable();

type LandingJson =
  string | number | boolean | null | LandingJson[] | { [key: string]: LandingJson };
export interface LandingConteudo {
  [key: string]: LandingJson;
}

export type LandingHeroConfig = {
  heroVideoPath: string | null;
  heroVideoUrl: string | null;
  heroPosterPath: string | null;
  heroPosterUrl: string | null;
  heroVideoSom: boolean;
  conteudo: LandingConteudo | null;
};

const CONFIG_VAZIA: LandingHeroConfig = {
  heroVideoPath: null,
  heroVideoUrl: null,
  heroPosterPath: null,
  heroPosterUrl: null,
  heroVideoSom: false,
  conteudo: null,
};

function tabelaNaoExiste(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    /42P01|PGRST205|landing_config|schema cache/i.test(`${error.code ?? ""} ${error.message ?? ""}`)
  );
}

function urlPublica(admin: any, path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || path.startsWith("/")) return path;
  return admin.storage.from("landing").getPublicUrl(path).data.publicUrl;
}

async function buscar(admin: any): Promise<LandingHeroConfig> {
  const { data, error } = await admin
    .from("landing_config")
    .select("hero_video_path, hero_poster_path, hero_video_som, conteudo")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return CONFIG_VAZIA;
  return {
    heroVideoPath: data.hero_video_path ?? null,
    heroVideoUrl: urlPublica(admin, data.hero_video_path ?? null),
    heroPosterPath: data.hero_poster_path ?? null,
    heroPosterUrl: urlPublica(admin, data.hero_poster_path ?? null),
    heroVideoSom: !!data.hero_video_som,
    conteudo: data.conteudo && typeof data.conteudo === "object" ? data.conteudo : null,
  };
}

function pathGerenciado(path: string | null): path is string {
  return !!path && !path.startsWith("/") && !/^https?:\/\//i.test(path);
}

export const listarLandingHeroConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingHeroConfig> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    try {
      return await buscar(admin);
    } catch (error) {
      if (tabelaNaoExiste(error as any)) return CONFIG_VAZIA;
      throw new Error("Não foi possível carregar o vídeo de abertura.");
    }
  },
);

export const listarLandingHeroConfigAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async (): Promise<LandingHeroConfig> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    try {
      return await buscar(admin);
    } catch (error) {
      if (tabelaNaoExiste(error as any)) {
        throw new Error("A migração do vídeo de abertura da landing ainda não foi aplicada.");
      }
      throw new Error((error as Error).message);
    }
  });

export const salvarLandingHeroConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({
        heroVideoPath: HERO_VIDEO_PATH,
        heroPosterPath: HERO_POSTER_PATH,
        heroVideoSom: z.boolean(),
        conteudo: z.record(z.unknown()).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const anterior = await buscar(admin);
    const { error } = await admin.from("landing_config").upsert(
      {
        id: 1,
        hero_video_path: data.heroVideoPath,
        hero_poster_path: data.heroPosterPath,
        hero_video_som: data.heroVideoSom,
        conteudo: data.conteudo ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);

    const antigos = [anterior.heroVideoPath, anterior.heroPosterPath].filter(
      (path): path is string =>
        pathGerenciado(path) && path !== data.heroVideoPath && path !== data.heroPosterPath,
    );
    if (antigos.length) await admin.storage.from("landing").remove(antigos);
    return { ok: true };
  });
