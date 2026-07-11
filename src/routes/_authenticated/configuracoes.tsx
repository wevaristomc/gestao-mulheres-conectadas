import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { requireModuleAccess } from "@/lib/auth-guard";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("configuracoes"),
  component: ConfiguracoesLayout,
});

function ConfiguracoesLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/configuracoes", label: "Geral", exact: true },
    { to: "/configuracoes/usuarios", label: "Usuários" },
    { to: "/configuracoes/permissoes", label: "Permissões" },
    { to: "/configuracoes/instrutor-turmas", label: "Instrutores ↔ Turmas" },
    { to: "/configuracoes/locais", label: "Locais" },
    { to: "/configuracoes/ia", label: "Inteligência Artificial" },
  ];
  return (
    <div>
      <PageHeader title="Configurações" description="Usuários, papéis e parâmetros do projeto." />
      <nav className="mb-4 flex gap-1 border-b">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "border-b-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}