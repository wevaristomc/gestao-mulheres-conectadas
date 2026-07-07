import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/mte")({
  head: () => ({ meta: [{ title: "Fiscalização MTE · Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("mte"),
  component: MteLayout,
});

const TABS = [
  { key: "turmas", label: "Turmas", to: "/mte/turmas" as const },
  { key: "beneficiarias", label: "Beneficiárias", to: "/mte/beneficiarias" as const },
  { key: "matriculas", label: "Matrículas", to: "/mte/matriculas" as const },
  { key: "aulas", label: "Aulas", to: "/mte/aulas" as const },
  { key: "presencas", label: "Presenças", to: "/mte/presencas" as const },
  { key: "importar-lista", label: "Importar Lista (PDF)", to: "/mte/importar-lista" as const },
  { key: "evidencias", label: "Evidências", to: "/mte/evidencias" as const },
  { key: "cronograma", label: "Cronograma", to: "/mte/cronograma" as const },
  { key: "checklist", label: "Checklist Fiscalização", to: "/mte/checklist" as const },
];

function MteLayout() {
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