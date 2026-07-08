import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RegisterDocumentoInput = z.object({
  projetoId: z.string().uuid(),
  titulo: z.string().min(1).max(300),
  descricao: z.string().nullable().optional(),
  categoria: z.string().min(1).max(80),
  storagePath: z.string().min(1).max(600),
  nomeArquivo: z.string().min(1).max(300),
  mimeType: z.string().nullable().optional(),
  tamanhoBytes: z.number().int().nonnegative(),
});

export const registerUploadedDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RegisterDocumentoInput.parse(v))
  .handler(async ({ data, context }) => {
    const missingColumn = (message: string): string | null => (
      message.match(/Could not find the '([^']+)' column/)?.[1] ||
      message.match(/column ["']?([^"'\s.]+)["']? does not exist/i)?.[1] ||
      null
    );

    const normalizedPrefix = `${data.projetoId}/`;
    if (!data.storagePath.startsWith(normalizedPrefix)) {
      throw new Error("Caminho de arquivo inválido para o projeto selecionado.");
    }

    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role, projeto_id")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(`Falha ao validar permissões: ${roleError.message}`);

    const canUseProject = (roles ?? []).some((row: { projeto_id?: string | null }) => row.projeto_id === data.projetoId || row.projeto_id == null);
    if (!canUseProject) {
      throw new Response("Forbidden: usuário sem vínculo com o projeto selecionado.", { status: 403 });
    }

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const payload: Record<string, unknown> = {
      projeto_id: data.projetoId,
      titulo: data.titulo,
      nome: data.titulo,
      descricao: data.descricao ?? null,
      categoria: data.categoria,
      tipo: data.categoria,
      storage_path: data.storagePath,
      nome_arquivo: data.nomeArquivo,
      mime_type: data.mimeType ?? null,
      tamanho_bytes: data.tamanhoBytes,
      created_by: context.userId,
      autor_id: context.userId,
    };

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const inserted = await admin.from("documentos").insert(payload).select("*").maybeSingle();
      if (!inserted.error) return { ok: true, row: inserted.data ?? payload };

      lastError = inserted.error.message;
      const missing = missingColumn(inserted.error.message);
      if (missing && missing in payload) {
        delete payload[missing];
        continue;
      }
      break;
    }

    await admin.storage.from("documentos").remove([data.storagePath]);
    throw new Error(`Arquivo enviado, mas não foi possível registrar na Base de Conhecimento: ${lastError ?? "erro desconhecido"}`);
  });