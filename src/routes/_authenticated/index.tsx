import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  GraduationCap,
  Wallet,
  AlertCircle,
  Milestone,
  Clock,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  kpiCursistasAtivasOptions,
  kpiTurmasOptions,
  kpiExecucaoOrcamentariaOptions,
  pendenciasAbertasCountOptions,
} from "@/lib/dashboard-queries";
import {
  etapasListOptions, atividadesByEtapaOptions,
  progresso, etapaAtual, isAtrasada,
  ETAPA_STATUS_LABEL,
} from "@/lib/etapas-queries";

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

      <EtapaAtualCard />
    </div>
  );
}

function EtapaAtualCard() {
  const { projetoId } = useActiveContext();
  const etapasQ = useQuery(etapasListOptions(projetoId));
  const etapa = etapaAtual(etapasQ.data?.rows ?? []);
  const ativQ = useQuery({
    ...atividadesByEtapaOptions(etapa?.id ?? null),
    enabled: !!etapa,
  });
  if (!etapa) return null;
  const rows = ativQ.data?.rows ?? [];
  const p = progresso(rows);
  const hoje = Date.now();
  const em7dias = hoje + 7 * 24 * 3600 * 1000;
  const proximos = rows
    .filter((a) => a.status !== "concluida" && a.prazo)
    .filter((a) => {
      const t = new Date(a.prazo! + "T23:59:59").getTime();
      return t <= em7dias;
    })
    .sort((a, b) => (a.prazo! < b.prazo! ? -1 : 1))
    .slice(0, 6);

  return (
    <Card className="mt-6 border-border/60">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Milestone className="h-4 w-4 text-primary" />
            Etapa atual — {etapa.numero}. {etapa.titulo}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {ETAPA_STATUS_LABEL[etapa.status]}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/etapas">Abrir etapa</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span className="font-medium text-foreground">
              {p.concluidas}/{p.total} · {p.pct}%
            </span>
          </div>
          <Progress value={p.pct} />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Próximos prazos (7 dias)
          </div>
          {proximos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum prazo nos próximos 7 dias.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {proximos.map((a) => {
                const atrasada = isAtrasada(a);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{a.titulo}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {a.prazo?.slice(8, 10)}/{a.prazo?.slice(5, 7)}
                      {atrasada && (
                        <Badge variant="destructive" className="ml-1 text-[10px]">Atrasada</Badge>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}