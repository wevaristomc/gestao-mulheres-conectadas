import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useActiveContext } from "@/hooks/use-active-context";
import { listarPermissoesPapel } from "@/lib/rbac.functions";
import type { ModuleKey } from "@/lib/role-access";
import type { PermissionRow } from "@/lib/permissions-model";

export type Acao = "ver" | "criar" | "editar" | "excluir";

export function usePermissoes() {
  const { user, role } = useActiveContext();
  const listarFn = useServerFn(listarPermissoesPapel);

  const q = useQuery({
    queryKey: ["permissoes_papel", role],
    enabled: !!user && !!role,
    retry: 2,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PermissionRow[]> => {
      if (!role) return [];
      return listarFn({ data: { role } }) as Promise<PermissionRow[]>;
    },
  });

  const rows = q.data ?? [];
  const source: "db" | "none" = rows.length > 0 ? "db" : "none";

  function can(modulo: ModuleKey | string, acao: Acao = "ver"): boolean {
    if (!role || q.isError || rows.length === 0) return false;
    const row = rows.find((r) => r.modulo === modulo);
    if (!row) return false;
    switch (acao) {
      case "ver": return row.pode_ver;
      case "criar": return row.pode_criar;
      case "editar": return row.pode_editar;
      case "excluir": return row.pode_excluir;
    }
  }

  return {
    can,
    isReady: !q.isLoading,
    isLoading: q.isLoading,
    error: q.error,
    source,
    role,
  };
}
