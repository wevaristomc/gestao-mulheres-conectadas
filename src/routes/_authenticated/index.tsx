import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  GraduationCap,
  Wallet,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  kpiCursistasAtivasOptions,
  kpiTurmasOptions,
  kpiExecucaoOrcamentariaOptions,
  pendenciasAbertasCountOptions,
} from "@/lib/dashboard-queries";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "Visão Geral · Painel Mulheres Conectadas" }],
  }),
  component: VisaoGeralPage,
});

type Kpi = {
  key: string;
  label: string;
  icon: LucideIcon;
  hint: string;
};

function VisaoGeralPage() {
  const { projetoId, projetoNome } = useActiveContext();
  const cursistas = useQuery(kpiCursistasAtivasOptions(projetoId));
  const turmas = useQuery(kpiTurmasOptions(projetoId));
  const execucao = useQuery(kpiExecucaoOrcamentariaOptions(projetoId));
  const pendencias = useQuery(pendenciasAbertasCountOptions());

  const nfInt = new Intl.NumberFormat("pt-BR");
  const nfPct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

  const cards: Array<Kpi & { query: ReturnType<typeof useQuery>; format: (v: unknown) => string }> = [
    {
      key: "cursistas",
      label: "Cursistas ativas",
      icon: Users,
      hint: "Matrículas vinculadas às turmas do projeto",
      query: cursistas,
      format: (v) => nfInt.format(Number((v as { value: number | null } | undefined)?.value ?? 0)),
    },
    {
      key: "turmas",
      label: "Turmas",
      icon: GraduationCap,
      hint: "Turmas cadastradas no projeto",
      query: turmas,
      format: (v) => nfInt.format(Number((v as { value: number | null } | undefined)?.value ?? 0)),
    },
    {
      key: "execucao",
      label: "Execução orçamentária",
      icon: Wallet,
      hint: "Executado ÷ previsto (orçamento_itens)",
      query: execucao,
      format: (v) => `${nfPct.format(Number((v as { value: number | null } | undefined)?.value ?? 0))}%`,
    },
    {
      key: "pendencias",
      label: "Pendências abertas",
      icon: AlertCircle,
      hint: "Itens com status = 'aberta'",
      query: pendencias,
      format: (v) => nfInt.format(Number((v as { value: number | null } | undefined)?.value ?? 0)),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visão Geral"
        description={
          projetoNome
            ? `Resumo executivo · ${projetoNome}`
            : "Selecione um projeto para visualizar os indicadores."
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((kpi) => {
          const { data, isLoading, isError } = kpi.query;
          const resultError = (data as { error?: string } | undefined)?.error;
          const showSkeleton = isLoading || (!!projetoId === false && kpi.key !== "pendencias");
          const failed = isError || !!resultError;
          return (
            <Card key={kpi.key} className="border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
                <kpi.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {showSkeleton ? (
                  <Skeleton className="h-9 w-24" />
                ) : failed ? (
                  <div className="text-3xl font-semibold tracking-tight text-muted-foreground">—</div>
                ) : (
                  <div className="text-3xl font-semibold tracking-tight text-foreground">
                    {kpi.format(data)}
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {failed ? "Sem acesso ou coluna indisponível" : kpi.hint}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}