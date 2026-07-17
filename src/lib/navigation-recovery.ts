const RELOAD_GUARD_KEY = "mc.navigation-recovery";
const RELOAD_GUARD_WINDOW_MS = 60_000;

const STALE_ROUTE_ASSET_PATTERNS = [
  /chunkloaderror/i,
  /loading (?:css )?chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
];

function collectErrorMessages(value: unknown, seen = new Set<unknown>()): string[] {
  if (value == null || seen.has(value)) return [];
  if (typeof value === "string") return [value];
  if (typeof value !== "object") return [String(value)];

  seen.add(value);
  const record = value as Record<string, unknown>;
  return [
    typeof record.name === "string" ? record.name : "",
    typeof record.message === "string" ? record.message : "",
    ...collectErrorMessages(record.cause, seen),
    ...collectErrorMessages(record.payload, seen),
  ].filter(Boolean);
}

export function isStaleRouteAssetError(error: unknown): boolean {
  const message = collectErrorMessages(error).join(" ");
  return STALE_ROUTE_ASSET_PATTERNS.some((pattern) => pattern.test(message));
}

type ReloadMarker = { path: string; at: number };

function readReloadMarker(): ReloadMarker | null {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReloadMarker>;
    if (typeof parsed.path !== "string" || typeof parsed.at !== "number") return null;
    return { path: parsed.path, at: parsed.at };
  } catch {
    return null;
  }
}

/**
 * Recarrega uma única vez a URL atual quando o navegador ficou com um chunk
 * antigo após uma publicação. O marcador evita ciclos caso a origem continue
 * indisponível ou o erro não seja causado por uma versão antiga.
 */
export function recoverStaleRouteAsset(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleRouteAssetError(error)) return false;

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const now = Date.now();
  const previous = readReloadMarker();
  if (previous && previous.path === path && now - previous.at < RELOAD_GUARD_WINDOW_MS) {
    return false;
  }

  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ path, at: now }));
  } catch {
    // Sem o marcador não há como impedir um ciclo de recargas.
    return false;
  }
  window.location.reload();
  return true;
}

export function reloadCurrentRoute(): void {
  if (typeof window !== "undefined") window.location.reload();
}
