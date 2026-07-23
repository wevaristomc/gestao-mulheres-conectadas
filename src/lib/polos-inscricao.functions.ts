/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePapel, PAPEIS_COORDENACAO } from "@/lib/rbac-guard";
import { POLOS_INSCRICAO } from "@/lib/inscricao-digital";

export type PoloInscricaoPublico = {
  id: string;
  nome: string;
  municipio: string;
  enderecoReferencia: string | null;
  latitude: number | null;
  longitude: number | null;
  ordem: number;
};
const fallback = POLOS_INSCRICAO.map((polo, index) => ({
  id: polo.nome,
  nome: polo.nome,
  municipio: polo.municipio,
  enderecoReferencia: null,
  latitude: null,
  longitude: null,
  ordem: index + 1,
}));

export const listarPolosInscricaoPublica = createServerFn({ method: "GET" }).handler(
  async (): Promise<PoloInscricaoPublico[]> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await getSupabaseAdmin()
      .from("polos_inscricao")
      .select("id,nome,municipio,endereco_referencia,latitude,longitude,ordem")
      .eq("ativo", true)
      .order("ordem");
    if (error || !data?.length) return fallback;
    return (data as any[]).map((p) => ({
      id: p.id,
      nome: p.nome,
      municipio: p.municipio ?? "",
      enderecoReferencia: p.endereco_referencia ?? null,
      latitude: p.latitude == null ? null : Number(p.latitude),
      longitude: p.longitude == null ? null : Number(p.longitude),
      ordem: Number(p.ordem ?? 0),
    }));
  },
);

const PoloInput = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2),
  municipio: z.string().trim().default(""),
  enderecoReferencia: z.string().trim().max(300).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  ativo: z.boolean().default(true),
  ordem: z.number().int().default(0),
});
export const salvarPoloInscricao = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PoloInput.parse(input))
  .handler(async ({ data }) => {
    await requirePapel(PAPEIS_COORDENACAO);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      nome: data.nome,
      municipio: data.municipio,
      endereco_referencia: data.enderecoReferencia ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      ativo: data.ativo,
      ordem: data.ordem,
      atualizado_em: new Date().toISOString(),
    };
    const query = data.id
      ? getSupabaseAdmin().from("polos_inscricao").update(payload).eq("id", data.id)
      : getSupabaseAdmin().from("polos_inscricao").insert(payload);
    const { error } = await query;
    if (error) throw new Error(`Não foi possível salvar o polo: ${error.message}`);
    return { ok: true };
  });

export const removerPoloInscricao = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await requirePapel(PAPEIS_COORDENACAO);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await getSupabaseAdmin()
      .from("polos_inscricao")
      .update({ ativo: false, atualizado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const geocodificarEndereco = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ enderecoCompleto: z.string().trim().min(5).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requirePapel(PAPEIS_COORDENACAO);
    const key = process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
    if (!key) throw new Error("GOOGLE_MAPS_GEOCODING_API_KEY não configurada no servidor.");
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", data.enderecoCompleto);
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", key);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Falha ao consultar a geocodificação.");
    const json = (await response.json()) as any;
    const result = json.results?.[0];
    if (!result?.geometry?.location) throw new Error("Endereço não localizado.");
    return {
      latitude: Number(result.geometry.location.lat),
      longitude: Number(result.geometry.location.lng),
      precisao: result.geometry.location_type ?? "UNKNOWN",
      enderecoFormatado: result.formatted_address ?? data.enderecoCompleto,
    };
  });
