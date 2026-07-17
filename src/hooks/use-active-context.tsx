import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { resolveHighestRole, type AppRole } from "@/lib/role-access";
import { supabase } from "@/integrations/supabase/client";
import { setCachedRole } from "@/lib/auth-guard";
import { useQueryClient } from "@tanstack/react-query";

type Projeto = { id: string; nome: string };
type RoleRow = { role: string; projeto_id: string | null; ativo?: boolean | null };

type ActiveContextValue = {
  user: { id: string; email: string } | null;
  mustChangePassword: boolean;
  projetoId: string | null;
  projetoNome: string | null;
  role: AppRole | null;
  projetosDisponiveis: Projeto[];
  setProjetoAtivo: (id: string) => void;
  isBackendConnected: boolean;
  isLoadingRoles: boolean;
};

const ActiveContext = createContext<ActiveContextValue | null>(null);
const PROJETO_STORAGE_KEY = "mc.active_projeto";

function pickRole(rows: RoleRow[], projetoId: string | null): AppRole | null {
  return resolveHighestRole(rows, projetoId);
}

export function ActiveContextProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);

  // Subscrever sessão
  useEffect(() => {
    let mounted = true;
    const applySession = (session: Session | null) => {
      const next = session?.user
        ? { id: session.user.id, email: session.user.email ?? "" }
        : null;
      setUser((current) =>
        current?.id === next?.id && current?.email === next?.email ? current : next,
      );
      setMustChangePassword(!!session?.user?.user_metadata?.must_change_password);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      applySession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      if (!session) {
        setRoleRows([]);
        setProjetos([]);
        setProjetoId(null);
        setCachedRole(null);
        setIsLoadingRoles(false);
        try {
          window.localStorage.removeItem(PROJETO_STORAGE_KEY);
        } catch {
          /* noop */
        }
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Carregar projetos + papéis quando usuário muda
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsLoadingRoles(true);
    (async () => {
      const [projRes, rolesRes] = await Promise.all([
        supabase.from("projetos").select("id, nome").order("nome"),
        supabase.from("user_roles").select("role, projeto_id, ativo").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      if (rolesRes.error) {
        // eslint-disable-next-line no-console
        console.error("[use-active-context] Falha ao ler user_roles:", rolesRes.error);
      }
      if (projRes.error) {
        // eslint-disable-next-line no-console
        console.error("[use-active-context] Falha ao ler projetos:", projRes.error);
      }
      if (rolesRes.error || projRes.error) {
        // Uma oscilação temporária não deve apagar o último contexto válido
        // nem expulsar a pessoa da rota que já estava utilizando.
        setIsLoadingRoles(false);
        return;
      }
      const projList = (projRes.data ?? []) as Projeto[];
      const roles = (rolesRes.data ?? []) as RoleRow[];
      setProjetos(projList);
      setRoleRows(roles);

      let initial: string | null = null;
      try {
        initial = window.localStorage.getItem(PROJETO_STORAGE_KEY);
      } catch {
        /* noop */
      }
      if (!initial || !projList.some((p) => p.id === initial)) {
        initial = projList[0]?.id ?? null;
      }
      setProjetoId(initial);
      setIsLoadingRoles(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const role = useMemo(() => pickRole(roleRows, projetoId), [roleRows, projetoId]);

  useEffect(() => {
    setCachedRole(role);
  }, [role]);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["pedagogico", "frequencia"] });
    queryClient.invalidateQueries({ queryKey: ["escopo-turmas"] });
  }, [queryClient, user?.id, role, projetoId]);

  const setProjetoAtivo = useCallback((id: string) => {
    setProjetoId(id);
    try {
      window.localStorage.setItem(PROJETO_STORAGE_KEY, id);
    } catch {
      /* noop */
    }
  }, []);

  const projetoNome = useMemo(
    () => projetos.find((p) => p.id === projetoId)?.nome ?? null,
    [projetos, projetoId],
  );

  const value = useMemo<ActiveContextValue>(
    () => ({
      user,
      mustChangePassword,
      projetoId,
      projetoNome,
      role,
      projetosDisponiveis: projetos,
      setProjetoAtivo,
      isBackendConnected: !!user,
      isLoadingRoles,
    }),
    [user, mustChangePassword, projetoId, projetoNome, role, projetos, setProjetoAtivo, isLoadingRoles],
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