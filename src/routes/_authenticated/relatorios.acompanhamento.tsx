import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  acompanhamentoOptions, formatarPercent, formatarMoeda,
} from "@/lib/relatorios-queries";

export const Route = createFileRoute("/_authenticated/relatorios/acompanhamento")({
  component: Acompanhamento,
});

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function Acompanhamento() {
  const { projetoId, projetoNome } = useActiveContext();
  const q = useQuery(acompanhamentoOptions(projetoId));
  const d = q.data;

  return (
    <div>
      <PageHeader
        title="Acompanhamento do projeto"
        description={projetoNome ? `Visão executiva · ${projetoNome}` : "Selecione um projeto"}
      />

      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : !d ? null : (
        <>
          {d.errors.length ? (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>Alguns indicadores não puderam ser lidos: {d.errors.join(" · ")}</div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Turmas" value={d.turmas === null ? "—" : String(d.turmas)} />
            <Kpi
              title="Cursistas ativas"
              value={d.cursistasAtivas === null ? "—" : String(d.cursistasAtivas)}
            />
            <Kpi
              title="Aulas realizadas"
              value={
                d.aulasRealizadas === null
                  ? "—"
                  : `${d.aulasRealizadas} / ${d.aulasPrevistas ?? "—"}`
              }
              hint={
                d.aulasPrevistas && d.aulasPrevistas > 0 && d.aulasRealizadas !== null
                  ? `${((d.aulasRealizadas / d.aulasPrevistas) * 100).toFixed(0)}% do previsto`
                  : undefined
              }
            />
            <Kpi title="Frequência média" value={formatarPercent(d.frequenciaMedia)} />
            <Kpi
              title="Execução orçamentária"
              value={formatarPercent(d.execucaoOrcamentaria?.pct ?? null)}
              hint={
                d.execucaoOrcamentaria
                  ? `${formatarMoeda(d.execucaoOrcamentaria.executado)} de ${formatarMoeda(d.execucaoOrcamentaria.previsto)}`
                  : undefined
              }
            />
            <Kpi
              title="Dias restantes"
              value={d.diasRestantes === null ? "—" : String(d.diasRestantes)}
              hint={d.projeto?.data_fim ? `Fim: ${d.projeto.data_fim}` : undefined}
            />
            <Kpi title="Valor global" value={formatarMoeda(d.projeto?.valor_global ?? null)} />
          </div>

          {d.aulasPrevistas && d.aulasPrevistas > 0 && d.aulasRealizadas !== null ? (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Progresso das aulas</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={(d.aulasRealizadas / d.aulasPrevistas) * 100} />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}