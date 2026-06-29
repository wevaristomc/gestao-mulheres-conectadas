import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AppRole } from "@/lib/role-access";

/**
 * Contexto do "projeto ativo" + role do usuário corrente nesse projeto.
 *
 * STUB: enquanto a integração Supabase externa não está conectada, este provider
 * fornece valores de placeholder para que o shell renderize. Ao conectar o
 * Supabase, substituir o conteúdo deste arquivo por queries reais a
 * `user_roles` / `projetos` via TanStack Query + server functions.
 */

type ActiveContextValue = {
  user: { id: string; email: string } | null;
  projetoId: string | null;
  projetoNome: string | null;
  role: AppRole | null;
  projetosDisponiveis: Array<{ id: string; nome: string }>;
  setProjetoAtivo: (id: string) => void;
  isBackendConnected: boolean;
};

const ActiveContext = createContext<ActiveContextValue | null>(null);

export function ActiveContextProvider({ children }: { children: ReactNode }) {
  // Placeholder enquanto Supabase não está conectado.
  // Fail-closed: nenhum papel é assumido. Quando o backend estiver conectado,
  // ler de `user_roles` via server function (`get_user_role`).
  const [role] = useState<AppRole | null>(null);
  const [projetoId, setProjetoId] = useState<string | null>(null);

  const value = useMemo<ActiveContextValue>(
    () => ({
      user: null,
      projetoId,
      projetoNome: null,
      role,
      projetosDisponiveis: [],
      setProjetoAtivo: setProjetoId,
      isBackendConnected: false,
    }),
    [projetoId, role],
  );

  return <ActiveContext.Provider value={value}>{children}</ActiveContext.Provider>;
}

export function useActiveContext() {
  const ctx = useContext(ActiveContext);
  if (!ctx) {
    throw new Error("useActiveContext deve ser usado dentro de <ActiveContextProvider>");
  }
  return ctx;
}

export function useHasRole() {
  const { role } = useActiveContext();
  return {
    role,
    hasRole: (r: AppRole) => role === r,
    hasAnyRole: (rs: AppRole[]) => (role ? rs.includes(role) : false),
  };
}