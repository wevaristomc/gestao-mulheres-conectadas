import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
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
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-background">
          <AppTopbar />
          <BackendNotice />
          <main className="flex-1 px-6 py-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ActiveContextProvider>
  );
}

function BackendNotice() {
  const { isBackendConnected } = useActiveContext();
  if (isBackendConnected) return null;
  return (
    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <strong className="font-semibold">Backend não conectado.</strong> Conecte a
        integração Supabase para ativar login, leitura de papéis e dados do
        projeto. Enquanto isso, o painel renderiza em modo de demonstração.
      </span>
    </div>
  );
}