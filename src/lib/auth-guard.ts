import { redirect } from "@tanstack/react-router";

import { canAccess, landingPathForRole, type AppRole, type ModuleKey } from "@/lib/role-access";

const ROLE_CACHE_KEY = "mc.active_role";

/**
 * Fail-closed session check used by `_authenticated` route guards.
 *
 * Looks for a Supabase auth token in `localStorage`. Until the Supabase
 * integration is wired up, no token will exist and every protected route
 * redirects to `/auth`. After the integration is connected, the Supabase
 * client persists a key matching `sb-<ref>-auth-token`, which satisfies
 * this check on subsequent navigations. Server-side enforcement (RLS +
 * authenticated server functions) remains the source of truth.
 */
export function hasClientSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = window.localStorage.getItem(key);
        if (raw && raw.length > 0) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function requireSession() {
  if (!hasClientSession()) {
    throw redirect({ to: "/auth" });
  }
}

export function getCachedRole(): AppRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROLE_CACHE_KEY);
    return raw ? (raw as AppRole) : null;
  } catch {
    return null;
  }
}

export function setCachedRole(role: AppRole | null) {
  if (typeof window === "undefined") return;
  try {
    if (role) window.localStorage.setItem(ROLE_CACHE_KEY, role);
    else window.localStorage.removeItem(ROLE_CACHE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Router-level role guard. Blocks direct URL navigation to modules the
 * user's role cannot access. The cached role is a UX hint only — the
 * authoritative check lives in Supabase RLS / server functions, which
 * reject queries from users who lack the role regardless of the client.
 */
export function requireModuleAccess(module: ModuleKey) {
  requireSession();
  const role = getCachedRole();
  // Fail-open only quando o papel ainda não foi hidratado (evita bounce
  // em hard refresh). Server-side (RLS + server fns) continua sendo a
  // verdade. Assim que o papel está em cache, bloqueamos toda rota fora
  // da matriz e mandamos para o destino padrão do papel.
  if (role === null) return;
  if (!canAccess(module, role)) {
    throw redirect({ to: landingPathForRole(role) });
  }
}