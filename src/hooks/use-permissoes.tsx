import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useActiveContext } from "@/hooks/use-active-context";
import { canAccess, type AppRole, type ModuleKey } from "@/lib/role-access";

/** Papéis v2 introduzidos na Fase 1 (SQL). */
export type AppRoleV2 =
  | "admin"
  | "coordenador"
  | "instrutor"
  | "financeiro"
  | "parceiro_mte"
  | "captacao";

export type Acao = "ver" | "criar" | "editar" | "excluir";

/** Mapeia enum antigo (client) → v2. Mesmo mapeamento do SQL de backfill. */
export function mapRoleV1toV2(role: AppRole | null): AppRoleV2 | null {
  if (!role) return null;
  switch (role) {
    case "coordenador_geral": return "admin";
    case "gestor_financeiro": return "financeiro";
    case "coordenador_pedagogico": return "coordenador";
    case "administrativo": return "coordenador";
    case "professor":
    case "auxiliar_pedagogico": return "instrutor";
    default: return null;
  }
}

type PermRow = {
  modulo: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
};

/**
 * Fase 2 — Hook de permissões com fallback.
 *
 * - Lê `permissoes_papel` filtrando pelo papel v2 do usuário atual.
 * - Se a tabela ainda não existir (Fase 1 não aplicada) ou a query falhar,
 *   cai para `canAccess` (hardcoded em role-access.ts) → comportamento atual.
 * - `can(modulo, 'ver')` é o único caso que hoje tem correspondência 1:1 no
 *   fallback; para 'criar/editar/excluir' o fallback assume o mesmo booleano
 *   de 'ver' (mantém comportamento pré-RBAC).
 */
export function usePermissoes() {
  const { user, role } = useActiveContext();
  const roleV2 = mapRoleV1toV2(role);

  const q = useQuery({
    queryKey: ["permissoes_papel", roleV2],
    enabled: !!user && !!roleV2,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<PermRow[] | null> => {
      if (!roleV2) return null;
      const { data, error } = await supabase
        .from("permissoes_papel" as any)
        .select("modulo, pode_ver, pode_criar, pode_editar, pode_excluir")
        .eq("role", roleV2);
      if (error) {
        // Silencia: tabela pode ainda não existir (Fase 1 não aplicada).
        // eslint-disable-next-line no-console
        console.warn("[usePermissoes] fallback:", error.message);
        return null;
      }
      return (data ?? []) as PermRow[];
    },
  });

  const rows = q.data ?? null;
  const source: "db" | "fallback" = rows && rows.length > 0 ? "db" : "fallback";

  function can(modulo: ModuleKey | string, acao: Acao = "ver"): boolean {
    if (rows && rows.length > 0) {
      const row = rows.find((r) => r.modulo === modulo);
      if (!row) return false;
      switch (acao) {
        case "ver": return row.pode_ver;
        case "criar": return row.pode_criar;
        case "editar": return row.pode_editar;
        case "excluir": return row.pode_excluir;
      }
    }
    // Fallback: só sabemos responder 'ver' com precisão. Para as demais ações,
    // devolvemos o mesmo booleano de 'ver' (comportamento anterior à Fase 1).
    return canAccess(modulo as ModuleKey, role);
  }

  return {
    can,
    isReady: !q.isLoading,
    isLoading: q.isLoading,
    source,
    roleV2,
  };
}
