import { useQuery } from "@tanstack/react-query";

import { useActiveContext } from "@/hooks/use-active-context";
import { supabase } from "@/integrations/supabase/client";

/**
 * Escopo de turmas do usuário atual.
 *
 * - Quando o papel efetivo é `professor` ou `auxiliar_pedagogico`, retorna
 *   `restrictToUserId` = user.id, e `turmasPermitidas` = ids das turmas
 *   vinculadas em `instrutor_turmas`.
 * - Para coordenação / administrativo / financeiro / etc., devolve
 *   `restrictToUserId = null` (sem restrição).
 *
 * As MTE queries usam `restrictToUserId` para filtrar as listas por turma.
 */
export function useEscopoTurmas() {
  const { user, role } = useActiveContext();
  const restrito = role === "professor" || role === "auxiliar_pedagogico";
  const restrictToUserId = restrito ? user?.id ?? null : null;

  const q = useQuery({
    queryKey: ["escopo-turmas", restrictToUserId],
    enabled: !!restrictToUserId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      if (!restrictToUserId) return [];
      const { data, error } = await supabase
        .from("instrutor_turmas")
        .select("turma_id")
        .eq("user_id", restrictToUserId);
      if (error) return [];
      return ((data ?? []) as { turma_id: string }[]).map((r) => r.turma_id);
    },
  });

  return {
    isRestrito: restrito,
    restrictToUserId,
    turmasPermitidas: restrito ? q.data ?? null : null,
    isLoading: restrito ? q.isLoading : false,
  };
}
