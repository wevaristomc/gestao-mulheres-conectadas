// Server-only. Nunca importar de código de componente/loader.
// Encapsula chamadas ao Connector Gateway do Google Drive.

const BASE = "https://connector-gateway.lovable.dev/google_drive";

export type GDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  modifiedTime?: string | null;
  iconLink?: string | null;
  webViewLink?: string | null;
  thumbnailLink?: string | null;
  parents?: string[] | null;
};

export const FOLDER_MIME = "application/vnd.google-apps.folder";

function requireEnv(): { lovableKey: string; connKey: string } {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurada");
  if (!connKey) throw new Error("GOOGLE_DRIVE_API_KEY não configurada — conecte o Google Drive nas configurações.");
  return { lovableKey, connKey };
}

export function getRootFolderId(): string | null {
  return process.env.GDRIVE_ROOT_FOLDER_ID || null;
}

function authHeaders(): HeadersInit {
  const { lovableKey, connKey } = requireEnv();
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

async function gwFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  return res;
}

async function gwJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await gwFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || text;
    } catch { /* keep raw */ }
    throw new Error(`Google Drive: ${res.status} ${msg.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

const FIELDS =
  "nextPageToken,files(id,name,mimeType,size,modifiedTime,iconLink,webViewLink,thumbnailLink,parents)";

export async function listChildren(params: {
  folderId: string;
  pageToken?: string | null;
  pageSize?: number;
  onlyFolders?: boolean;
  orderBy?: string;
}): Promise<{ files: GDriveFile[]; nextPageToken?: string | null }> {
  const clauses = [`'${params.folderId.replace(/'/g, "\\'")}' in parents`, `trashed = false`];
  if (params.onlyFolders) clauses.push(`mimeType = '${FOLDER_MIME}'`);
  const q = clauses.join(" and ");
  const usp = new URLSearchParams({
    q,
    fields: FIELDS,
    pageSize: String(params.pageSize ?? 50),
    orderBy: params.orderBy ?? "folder,name",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (params.pageToken) usp.set("pageToken", params.pageToken);
  return gwJson(`/drive/v3/files?${usp.toString()}`);
}

export async function searchByName(params: {
  rootId: string;
  q: string;
  pageToken?: string | null;
  pageSize?: number;
}): Promise<{ files: GDriveFile[]; nextPageToken?: string | null }> {
  // Busca por nome; depois filtramos por descendência da raiz em memória.
  const safe = params.q.replace(/'/g, "\\'").replace(/"/g, '\\"');
  const q = `name contains '${safe}' and trashed = false`;
  const usp = new URLSearchParams({
    q,
    fields: FIELDS,
    pageSize: String(params.pageSize ?? 50),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (params.pageToken) usp.set("pageToken", params.pageToken);
  const raw = await gwJson<{ files: GDriveFile[]; nextPageToken?: string | null }>(
    `/drive/v3/files?${usp.toString()}`,
  );
  const filtered: GDriveFile[] = [];
  for (const f of raw.files ?? []) {
    if (await isDescendantOf(f.id, params.rootId)) filtered.push(f);
  }
  return { files: filtered, nextPageToken: raw.nextPageToken ?? null };
}

export async function getMeta(fileId: string): Promise<GDriveFile> {
  const usp = new URLSearchParams({
    fields: "id,name,mimeType,size,modifiedTime,webViewLink,parents",
    supportsAllDrives: "true",
  });
  return gwJson<GDriveFile>(`/drive/v3/files/${encodeURIComponent(fileId)}?${usp.toString()}`);
}

// Cache de descendência em memória (curto). Chave: fileId → boolean.
const descendantCache = new Map<string, { root: string; ok: boolean; ts: number }>();
const CACHE_TTL_MS = 60_000;

export async function isDescendantOf(fileId: string, rootId: string): Promise<boolean> {
  if (fileId === rootId) return true;
  const cached = descendantCache.get(fileId);
  if (cached && cached.root === rootId && Date.now() - cached.ts < CACHE_TTL_MS) return cached.ok;
  const seen = new Set<string>();
  let current: string[] = [fileId];
  for (let hop = 0; hop < 8 && current.length; hop += 1) {
    const next: string[] = [];
    for (const id of current) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (id === rootId) {
        descendantCache.set(fileId, { root: rootId, ok: true, ts: Date.now() });
        return true;
      }
      try {
        const meta = await getMeta(id);
        for (const p of meta.parents ?? []) next.push(p);
      } catch {
        // Sem acesso ao pai — considera não descendente.
      }
    }
    current = next;
  }
  descendantCache.set(fileId, { root: rootId, ok: false, ts: Date.now() });
  return false;
}

export async function downloadFileBase64(
  fileId: string,
): Promise<{ base64: string; contentType: string; size: number }> {
  const res = await gwFetch(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google Drive: falha ao baixar (${res.status}) ${t.slice(0, 200)}`);
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, Math.min(i + chunk, buf.length)));
  }
  const base64 = btoa(bin);
  return { base64, contentType, size: buf.length };
}

export async function createFolder(name: string, parentId: string): Promise<GDriveFile> {
  return gwJson<GDriveFile>(`/drive/v3/files?fields=id,name,mimeType,parents,webViewLink&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
}

export async function uploadFile(input: {
  name: string;
  mimeType: string;
  base64: string;
  parentId: string;
}): Promise<GDriveFile> {
  const boundary = `----lovable-${Math.random().toString(36).slice(2)}`;
  const meta = { name: input.name, parents: [input.parentId], mimeType: input.mimeType };
  const bin = atob(input.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${input.mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  const res = await gwFetch(
    `/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,webViewLink&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Drive: upload falhou (${res.status}) ${text.slice(0, 200)}`);
  return JSON.parse(text) as GDriveFile;
}

export async function verifyConnection(): Promise<{ ok: boolean; message?: string }> {
  try {
    requireEnv();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  const root = getRootFolderId();
  if (!root) {
    return { ok: false, message: "GDRIVE_ROOT_FOLDER_ID não configurado." };
  }
  try {
    const meta = await getMeta(root);
    return { ok: true, message: `Pasta raiz: ${meta.name}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}