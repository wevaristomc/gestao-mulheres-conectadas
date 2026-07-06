import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("relatorios"),
  component: RelatoriosLayout,
});

const TABS = [
  { key: "frequencia", label: "Frequência", to: "/relatorios/frequencia" as const },
  { key: "pedagogico", label: "Pedagógico", to: "/relatorios/pedagogico" as const },
  { key: "orcamentario", label: "Orçamentário", to: "/relatorios/orcamentario" as const },
  { key: "metas", label: "Metas do Projeto", to: "/relatorios/metas" as const },
];

function RelatoriosLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.to);
          return (
            <Link
              key={t.key}
              to={t.to}
              className={
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
                (active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}