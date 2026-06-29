import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { APP_ROLES, type AppRole } from "@/lib/role-access";
import { supabase } from "@/integrations/supabase/client";
import { setCachedRole } from "@/lib/auth-guard";

type Projeto = { id: string; nome: string };
type RoleRow = { role: string; projeto_id: string | null };

type ActiveContextValue = {
  user: { id: string; email: string } | null;
  projetoId: string | null;
  projetoNome: string | null;
  role: AppRole | null;
  projetosDisponiveis: Projeto[];
  setProjetoAtivo: (id: string) => void;
  isBackendConnected: boolean;
};

const ActiveContext = createContext<ActiveContextValue | null>(null);
const PROJETO_STORAGE_KEY = "mc.active_projeto";

function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

function pickRole(rows: RoleRow[], projetoId: string | null): AppRole | null {
  if (!rows.length) return null;
  const match =
    (projetoId && rows.find((r) => r.projeto_id === projetoId)) ||
    rows.find((r) => r.projeto_id === null) ||
    rows[0];
  return match && isAppRole(match.role) ? match.role : null;
}

export function ActiveContextProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [projetoId, setProjetoId] = useState<string | null>(null);

  // Subscrever sessão
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const s = data.session;
      setUser(s?.user ? { id: s.user.id, email: s.user.email ?? "" } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? "" } : null);
      if (!session) {
        setRoleRows([]);
        setProjetos([]);
        setProjetoId(null);
        setCachedRole(null);
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
    (async () => {
      const [projRes, rolesRes] = await Promise.all([
        supabase.from("projetos").select("id, nome").order("nome"),
        supabase.from("user_roles").select("role, projeto_id").eq("user_id", user.id),
      ]);
      if (cancelled) return;
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
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const role = useMemo(() => pickRole(roleRows, projetoId), [roleRows, projetoId]);

  useEffect(() => {
    setCachedRole(role);
  }, [role]);

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
      projetoId,
      projetoNome,
      role,
      projetosDisponiveis: projetos,
      setProjetoAtivo,
      isBackendConnected: !!user,
    }),
    [user, projetoId, projetoNome, role, projetos, setProjetoAtivo],
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