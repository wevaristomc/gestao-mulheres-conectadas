import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { OrbeNeural } from "@/components/orbe/orbe-neural";
import { ActiveContextProvider, useActiveContext } from "@/hooks/use-active-context";
import { requireSession } from "@/lib/auth-guard";
import { canAccess, landingPathForRole, type ModuleKey } from "@/lib/role-access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    requireSession();
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <ActiveContextProvider>
      <PasswordChangeGate />
      <RoleAccessGate />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-background">
          <AppTopbar />
          <BackendNotice />
          <main className="flex-1 px-3 py-4 md:px-6 md:py-6">
            <Outlet />
          </main>
          <OrbeNeural />
        </SidebarInset>
      </SidebarProvider>
    </ActiveContextProvider>
  );
}

function PasswordChangeGate() {
  const { mustChangePassword, user } = useActiveContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    if (user && mustChangePassword && pathname !== "/trocar-senha") {
      navigate({ to: "/trocar-senha", replace: true });
    }
  }, [user, mustChangePassword, pathname, navigate]);
  return null;
}

// Mapa prefixo-de-rota → módulo. Ordem importa: prefixos mais longos primeiro
// para que `/financeiro/relacoes-horas` case antes de `/financeiro`.
const PATH_MODULE: Array<[string, ModuleKey]> = [
  ["/financeiro/relacoes-horas", "financeiro-relacoes-horas"],
  ["/base-conhecimento", "base-conhecimento"],
  ["/relacao-horas", "relacao-horas"],
  ["/configuracoes", "configuracoes"],
  ["/administrativo", "administrativo"],
  ["/pedagogico", "pedagogico"],
  ["/pendencias", "pendencias"],
  ["/relatorios", "relatorios"],
  ["/financeiro", "financeiro"],
  ["/captacao", "captacao"],
  ["/whatsapp", "whatsapp"],
  ["/etapas", "etapas"],
  ["/drive", "drive"],
  ["/ajuda", "ajuda"],
  ["/mte", "mte"],
];

function moduleForPath(pathname: string): ModuleKey | null {
  if (pathname === "/") return "visao-geral";
  for (const [prefix, mod] of PATH_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return mod;
  }
  return null;
}

/**
 * Guarda de acesso em nível de layout. `beforeLoad` só usa o papel em cache
 * (fail-open enquanto o provider hidrata); aqui, assim que `role` está
 * disponível via contexto, redirecionamos para o destino padrão do papel
 * quando a rota atual está fora da matriz. Rotas neutras (ex.: /trocar-senha)
 * ficam liberadas.
 */
function RoleAccessGate() {
  const { role, isLoadingRoles, user } = useActiveContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    if (!user || isLoadingRoles || !role) return;
    const mod = moduleForPath(pathname);
    if (!mod) return; // rota não mapeada (ex.: /trocar-senha)
    if (!canAccess(mod, role)) {
      navigate({ to: landingPathForRole(role), replace: true });
    }
  }, [role, isLoadingRoles, user, pathname, navigate]);
  return null;
}

function BackendNotice() {
  const { isBackendConnected } = useActiveContext();
  if (isBackendConnected) return null;
  return (
    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <strong className="font-semibold">Sessão não iniciada.</strong> Faça{" "}
        <a href="/auth" className="underline font-semibold">login</a> para
        carregar seus papéis e os dados do projeto.
      </span>
    </div>
  );
}