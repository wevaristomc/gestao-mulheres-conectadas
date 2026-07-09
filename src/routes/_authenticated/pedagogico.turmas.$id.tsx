import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireModuleAccess } from "@/lib/auth-guard";
import { turmaByIdOptions, pickFirst, formatarData, nomeTurma } from "@/lib/pedagogico-queries";

export const Route = createFileRoute("/_authenticated/pedagogico/turmas/$id")({
  head: () => ({ meta: [{ title: "Turma · Pedagógico" }] }),
  beforeLoad: () => requireModuleAccess("pedagogico"),
  component: TurmaLayout,
});

const TABS = [
  { key: "aulas", label: "Aulas", to: "/pedagogico/turmas/$id/aulas" as const },
  { key: "frequencia", label: "Frequência", to: "/pedagogico/turmas/$id/frequencia" as const },
  { key: "cursistas", label: "Cursistas", to: "/pedagogico/turmas/$id/cursistas" as const },
  { key: "certificados", label: "Certificados", to: "/pedagogico/turmas/$id/certificados" as const },
];

function TurmaLayout() {
  const { id } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const q = useQuery(turmaByIdOptions(id));
  const row = q.data?.row;
  const nome = nomeTurma(row);
  const turno = pickFirst(row, ["turno", "periodo"]);
  const inicio = pickFirst(row, ["data_inicio", "inicio"]);
  const fim = pickFirst(row, ["data_fim", "fim"]);
  const profNome = pickFirst(row, ["professor_nome", "professor"]);
  const profEmail = pickFirst(row, ["professor_email"]);

  const desc = [
    turno ? `Turno: ${turno}` : null,
    inicio ? `Início: ${formatarData(inicio)}` : null,
    fim ? `Fim: ${formatarData(fim)}` : null,
    profNome ? `Prof(a): ${profNome}${profEmail ? ` · ${profEmail}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <Link
        to="/pedagogico"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar para turmas
      </Link>

      <PageHeader
        title={q.isLoading ? "Carregando…" : nome}
        description={q.isLoading ? "" : desc || "Detalhes da turma"}
      />

      {q.isLoading ? (
        <Skeleton className="mb-4 h-10 w-80" />
      ) : (
        <div className="mb-4 flex gap-1 border-b">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.to.replace("$id", id));
            return (
              <Link
                key={t.key}
                to={t.to}
                params={{ id }}
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
      )}

      <Outlet />
    </div>
  );
}