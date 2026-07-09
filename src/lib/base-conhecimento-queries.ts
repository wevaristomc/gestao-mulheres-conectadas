import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Padrão de descoberta em runtime: tabela `documentos` + bucket `documentos`.
// Se algo faltar, a UI mostra banner com o schema esperado ao invés de quebrar.

export type DocRow = Record<string, unknown> & { id: string };

export const BUCKET = "documentos";

export const CATEGORIAS = [
  { key: "termo_fomento", label: "Termo de Fomento" },
  { key: "modelos", label: "Modelos e formulários" },
  { key: "normas", label: "Normas e legislação" },
  { key: "comunicacao", label: "Comunicação" },
  { key: "pedagogico", label: "Material pedagógico" },
  { key: "relatorios_externos", label: "Relatórios externos" },
  { key: "anotacoes", label: "Anotações" },
  { key: "audios_whatsapp", label: "Áudios / WhatsApp" },
  { key: "outros", label: "Outros" },
] as const;

export type CategoriaKey = (typeof CATEGORIAS)[number]["key"];

export type FormatoDoc = "arquivo" | "anotacao" | "audio" | "link_externo";
export type IndexStatus = "pendente" | "processando" | "concluida" | "erro" | "nao_aplicavel";

export const FORMATO_LABEL: Record<FormatoDoc, string> = {
  arquivo: "Arquivo",
  anotacao: "Anotação",
  audio: "Áudio",
  link_externo: "Link",
};

export function categoriaLabel(k: string | null | undefined): string {
  return CATEGORIAS.find((c) => c.key === k)?.label ?? String(k ?? "—");
}

export function formatBytes(n: number | null | undefined): string {
  const b = Number(n ?? 0);
  if (!b) return "—";
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatarData(v: unknown): string {
  if (!v) return "—";
  const s = String(v).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function pickFirst(row: DocRow | null, keys: string[]): unknown {
  if (!row) return null;
  for (const k of keys) if (row[k] != null) return row[k];
  return null;
}

export function documentosListOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["base-conhecimento", "documentos", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: DocRow[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      let res = await supabase
        .from("documentos")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("created_at", { ascending: false });
      if (res.error && /column .*created_at.* does not exist/i.test(res.error.message)) {
        res = await supabase
          .from("documentos")
          .select("*")
          .eq("projeto_id", projetoId)
          .order("criado_em", { ascending: false });
      }
      if (res.error && /column .*criado_em.* does not exist/i.test(res.error.message)) {
        res = await supabase.from("documentos").select("*").eq("projeto_id", projetoId);
      }
      if (res.error) return { rows: [], error: res.error.message };
      return { rows: (res.data ?? []) as DocRow[] };
    },
  });
}

function sanitize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

export async function uploadDocumentoFile(input: {
  projeto_id: string;
  file: File;
}): Promise<{ path: string }> {
  const { file, projeto_id } = input;
  const uid = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
  const path = `${projeto_id}/${uid}-${sanitize(file.name)}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (up.error) throw new Error(`Falha ao enviar arquivo: ${up.error.message}`);
  return { path };
}

export async function removeDocumentoFile(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function deleteDocumento(row: DocRow) {
  const path = row.storage_path ? String(row.storage_path) : null;
  const del = await supabase.from("documentos").delete().eq("id", row.id);
  if (del.error) throw new Error(del.error.message);
  if (path) {
    // best-effort — se falhar não bloqueia
    await supabase.storage.from(BUCKET).remove([path]);
  }
}

export async function getSignedUrl(path: string, expiresIn = 60): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}