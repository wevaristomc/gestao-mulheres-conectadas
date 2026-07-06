import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WRITE_ROLES = new Set([
  "coordenador_geral",
  "coordenador_pedagogico",
  "administrativo",
]);

async function assertWriteRole(context: { userId: string; supabase: any }) {
  // Verifica no user_roles se o usuário tem role de escrita.
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(`Falha ao validar permissões: ${error.message}`);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r: string) => WRITE_ROLES.has(r));
  if (!ok) throw new Response("Forbidden: role sem permissão de escrita no Drive", { status: 403 });
}

export const verifyGdriveConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { verifyConnection, getRootFolderId } = await import("@/lib/gdrive-helpers.server");
    const res = await verifyConnection();
    return { ...res, rootFolderId: getRootFolderId() };
  });

// ------------------------------ Listagem / busca ------------------------------

const ListInput = z.object({
  folderId: z.string().nullish(),
  pageToken: z.string().nullish(),
  onlyFolders: z.boolean().optional(),
  orderBy: z.string().optional(),
});

export const listGdrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data }) => {
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    const folderId = data.folderId || root;
    if (folderId !== root) {
      const ok = await h.isDescendantOf(folderId, root);
      if (!ok) throw new Response("Forbidden: pasta fora da raiz do Projeto.", { status: 403 });
    }
    const res = await h.listChildren({
      folderId,
      pageToken: data.pageToken ?? null,
      onlyFolders: data.onlyFolders,
      orderBy: data.orderBy,
    });
    return { ...res, folderId, rootFolderId: root };
  });

const SearchInput = z.object({ q: z.string().min(2), pageToken: z.string().nullish() });

export const searchGdrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => SearchInput.parse(v))
  .handler(async ({ data }) => {
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    return h.searchByName({ rootId: root, q: data.q, pageToken: data.pageToken ?? null });
  });

const CrumbInput = z.object({ folderId: z.string() });

export const gdriveBreadcrumb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CrumbInput.parse(v))
  .handler(async ({ data }) => {
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    const crumbs: { id: string; name: string }[] = [];
    let current = data.folderId;
    for (let hop = 0; hop < 10; hop += 1) {
      const meta = await h.getMeta(current);
      crumbs.unshift({ id: meta.id, name: meta.name });
      if (meta.id === root) break;
      const parent = meta.parents?.[0];
      if (!parent) break;
      current = parent;
    }
    return { crumbs };
  });

// ------------------------------ Import → Supabase Storage ------------------------------

const ImportInput = z.object({
  fileId: z.string(),
  bucket: z.enum(["documentos", "evidencias"]),
  pathPrefix: z.string().optional(),
});

export const importGdriveToBucket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ImportInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertWriteRole(context);
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    const ok = await h.isDescendantOf(data.fileId, root);
    if (!ok) throw new Response("Forbidden: arquivo fora da raiz do Projeto.", { status: 403 });

    const meta = await h.getMeta(data.fileId);
    if (meta.mimeType === h.FOLDER_MIME) throw new Error("Selecione um arquivo, não uma pasta.");

    const dl = await h.downloadFileBase64(data.fileId);
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = getSupabaseAdmin();
    const uid = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    const safeName = meta.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
    const path = `${data.pathPrefix ?? "gdrive"}/${uid}-${safeName}`.replace(/\/+/g, "/");
    const bytes = Uint8Array.from(atob(dl.base64), (c) => c.charCodeAt(0));

    const up = await supabaseAdmin.storage.from(data.bucket).upload(path, bytes, {
      contentType: dl.contentType,
      upsert: false,
    });
    if (up.error) throw new Error(`Falha ao subir no bucket ${data.bucket}: ${up.error.message}`);
    const pub = supabaseAdmin.storage.from(data.bucket).getPublicUrl(path);

    return {
      storage_path: path,
      nome_arquivo: meta.name,
      mime_type: dl.contentType,
      tamanho_bytes: dl.size,
      arquivo_url: pub.data.publicUrl,
      gdrive_id: meta.id,
      gdrive_link: meta.webViewLink ?? null,
    };
  });

// ------------------------------ Escrita no Drive ------------------------------

const CreateFolderInput = z.object({ name: z.string().min(1).max(200), parentId: z.string().optional() });

export const createGdriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CreateFolderInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertWriteRole(context);
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    const parentId = data.parentId || root;
    if (parentId !== root) {
      const ok = await h.isDescendantOf(parentId, root);
      if (!ok) throw new Response("Forbidden", { status: 403 });
    }
    return h.createFolder(data.name, parentId);
  });

const UploadInput = z.object({
  name: z.string().min(1).max(300),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
  parentId: z.string().optional(),
});

export const uploadToGdrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => UploadInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertWriteRole(context);
    const h = await import("@/lib/gdrive-helpers.server");
    const root = h.getRootFolderId();
    if (!root) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");
    const parentId = data.parentId || root;
    if (parentId !== root) {
      const ok = await h.isDescendantOf(parentId, root);
      if (!ok) throw new Response("Forbidden", { status: 403 });
    }
    return h.uploadFile({ name: data.name, mimeType: data.mimeType, base64: data.base64, parentId });
  });