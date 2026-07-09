import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = new Set([
  "coordenador_geral",
  "coordenador_pedagogico",
  "administrativo",
  "instrutor",
]);

async function assertLerListaRole(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(`Falha ao validar permissões: ${error.message}`);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r: string) => ALLOWED_ROLES.has(r));
  if (!ok) throw new Response("Forbidden: sem permissão para ler PDFs do Drive.", { status: 403 });
}

const Input = z.object({ fileId: z.string().min(4) });

export const baixarPdfDoDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data, context }) => {
    await assertLerListaRole(context);
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    const ok = await h.isDescendantOf(data.fileId, root);
    if (!ok) throw new Response("Forbidden: arquivo fora da raiz do Projeto.", { status: 403 });

    const meta = await h.getMeta(data.fileId);
    if (meta.mimeType === h.FOLDER_MIME) throw new Error("Selecione um arquivo, não uma pasta.");
    const dl = await h.downloadFileBase64(data.fileId);
    const mime = dl.contentType || meta.mimeType || "application/octet-stream";
    const isPdf = mime === "application/pdf" || meta.name.toLowerCase().endsWith(".pdf");
    const isImg = mime.startsWith("image/");
    if (!isPdf && !isImg) {
      throw new Error(`Tipo de arquivo não suportado (${mime}). Envie PDF ou imagem da lista.`);
    }
    return {
      nome: meta.name,
      mime: isPdf ? "application/pdf" : mime,
      base64: dl.base64,
      tamanho: dl.size,
    };
  });