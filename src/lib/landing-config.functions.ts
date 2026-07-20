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
const HERO_UPLOAD_PATH = z.union([HERO_VIDEO_PATH.unwrap(), HERO_POSTER_PATH.unwrap()]);

export type LandingHeroConfig = {
  heroVideoPath: string | null;
  heroVideoUrl: string | null;
  heroPosterPath: string | null;
  heroPosterUrl: string | null;
  heroVideoSom: boolean;
};

export type LandingHeroUploadAssinado = {
  path: string;
  token: string;
};

const CONFIG_VAZIA: LandingHeroConfig = {
  heroVideoPath: null,
  heroVideoUrl: null,
  heroPosterPath: null,
  heroPosterUrl: null,
  heroVideoSom: false,
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
    .select("hero_video_path, hero_poster_path, hero_video_som")
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
  };
}

function pathGerenciado(path: string | null): path is string {
  return !!path && !path.startsWith("/") && !/^https?:\/\//i.test(path);
}

async function criarUrlAssinada(admin: any, path: string): Promise<LandingHeroUploadAssinado> {
  const { data, error } = await admin.storage.from("landing").createSignedUploadUrl(path);
  if (error || !data?.token) {
    throw new Error(error?.message ?? "Não foi possível preparar o upload.");
  }
  return { path, token: data.token };
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

export const prepararUploadLandingHero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z.object({ tipo: z.enum(["video", "poster"]), mime: z.string().trim() }).parse(input),
  )
  .handler(async ({ data }): Promise<LandingHeroUploadAssinado> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    if (data.tipo === "video") {
      if (data.mime !== "video/mp4") throw new Error("O vídeo deve ser um arquivo MP4.");
      return criarUrlAssinada(admin, `hero/${crypto.randomUUID()}.mp4`);
    }
    if (!["image/jpeg", "image/png"].includes(data.mime)) {
      throw new Error("O poster deve ser uma imagem JPG ou PNG.");
    }
    const extensao = data.mime === "image/png" ? "png" : "jpg";
    return criarUrlAssinada(admin, `hero/${crypto.randomUUID()}.${extensao}`);
  });

export const removerLandingHeroUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ path: HERO_UPLOAD_PATH }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    await admin.storage.from("landing").remove([data.path]);
    return { ok: true };
  });

export const salvarLandingHeroConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({
        heroVideoPath: HERO_VIDEO_PATH,
        heroPosterPath: HERO_POSTER_PATH,
        heroVideoSom: z.boolean(),
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
