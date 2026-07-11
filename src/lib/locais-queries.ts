import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Local = {
  id: string;
  nome: string;
  endereco: string | null;
  municipio: string | null;
  ativo: boolean;
  criado_em?: string;
};

export function locaisOptions(soAtivos = true) {
  return queryOptions({
    queryKey: ["locais", "lista", soAtivos],
    queryFn: async (): Promise<{ rows: Local[]; error?: string }> => {
      let q = supabase.from("locais" as any).select("*").order("nome", { ascending: true });
      if (soAtivos) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as unknown as Local[] };
    },
  });
}

export async function upsertLocal(input: Partial<Local> & { nome: string }): Promise<Local> {
  const payload = {
    nome: input.nome.trim(),
    endereco: input.endereco ?? null,
    municipio: input.municipio ?? null,
    ativo: input.ativo ?? true,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("locais" as any)
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as Local;
  }
  const { data, error } = await supabase
    .from("locais" as any)
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Local;
}

export async function deleteLocal(id: string) {
  const { error } = await supabase.from("locais" as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function formatLocalCompleto(l: Pick<Local, "nome" | "municipio">): string {
  return l.municipio ? `${l.nome} - ${l.municipio}` : l.nome;
}