import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useActiveContext } from "@/hooks/use-active-context";
import { canAccess, type AppRole, type ModuleKey } from "@/lib/role-access";

export type Acao = "ver" | "criar" | "editar" | "excluir";

type PermRow = {
  modulo: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
};

/**
 * Hook de permissões com fallback.
 *
 * - Lê `permissoes_papel` filtrando pelo papel real do usuário atual.
 * - Se a tabela/query falhar, cai para `canAccess` (matriz fixa em role-access.ts).
 * - Para 'criar/editar/excluir' no fallback, devolve o mesmo booleano de 'ver'.
 */
export function usePermissoes() {
  const { user, role } = useActiveContext();

  const q = useQuery({
    queryKey: ["permissoes_papel", role],
    enabled: !!user && !!role,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<PermRow[] | null> => {
      if (!role) return null;
      const { data, error } = await supabase
        .from("permissoes_papel" as any)
        .select("modulo, pode_ver, pode_criar, pode_editar, pode_excluir")
        .eq("role", role);
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
    role,
  };
}
