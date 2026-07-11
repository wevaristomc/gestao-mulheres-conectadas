import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { OrbeNeural } from "@/components/orbe/orbe-neural";
import { ActiveContextProvider, useActiveContext } from "@/hooks/use-active-context";
import { requireSession } from "@/lib/auth-guard";

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