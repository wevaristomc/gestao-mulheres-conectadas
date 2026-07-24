import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { requireModuleAccess } from "@/lib/auth-guard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/administrativo")({
  head: () => ({ meta: [{ title: "Administrativo · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("administrativo"),
  component: AdministrativoLayout,
});

function AdministrativoLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/administrativo/inscricoes", label: "Inscrições" },
    { to: "/administrativo/depoimentos", label: "Landing" },
    { to: "/administrativo/perguntas", label: "Perguntas da inscrição" },
    { to: "/administrativo/qualificacao", label: "Qualificação para Certificado" },
    { to: "/administrativo/beneficios", label: "Benefícios" },
    { to: "/administrativo/materiais", label: "Materiais" },
  ];
  return (
    <div>
      <PageHeader
        title="Administrativo"
        description="Inscrições, landing, qualificação para certificados e entregas de benefícios e materiais."
      />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
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
