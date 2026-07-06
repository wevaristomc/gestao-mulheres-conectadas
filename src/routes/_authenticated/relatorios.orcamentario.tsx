import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useActiveContext } from "@/hooks/use-active-context";
import { orcamentoResumoOptions, formatarMoeda } from "@/lib/relatorios-queries";
import { AnaliseIA } from "@/components/analise-ia";

export const Route = createFileRoute("/_authenticated/relatorios/orcamentario")({
  component: Orcamentario,
});

function Orcamentario() {
  const { projetoId, projetoNome } = useActiveContext();
  const q = useQuery(orcamentoResumoOptions(projetoId));
  const d = q.data;

  function getContexto(): string | null {
    if (!d) return null;
    const linhas = d.rubricas.map(
      (r) =>
        `- ${r.categoria}: previsto ${formatarMoeda(r.previsto)}, executado ${formatarMoeda(r.executado)} (${r.pct.toFixed(1)}%).`,
    );
    return `Totais: previsto ${formatarMoeda(d.totalPrevisto)}, executado ${formatarMoeda(d.totalExecutado)} (${d.pctTotal.toFixed(1)}%).\nPor rubrica:\n${linhas.join("\n") || "sem itens"}`;
  }

  return (
    <div>
      <PageHeader
        title="Orçamentário"
        description={projetoNome ? `Execução por rubrica · ${projetoNome}` : "Selecione um projeto"}
      />

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !d ? null : (
        <>
          {d.errors.length ? (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>{d.errors.join(" · ")}</div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Previsto</CardTitle>
              </CardHeader>
              <CardContent><div className="text-2xl font-semibold">{formatarMoeda(d.totalPrevisto)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Executado</CardTitle>
              </CardHeader>
              <CardContent><div className="text-2xl font-semibold">{formatarMoeda(d.totalExecutado)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">% Execução</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{d.pctTotal.toFixed(1)}%</div>
                <Progress value={Math.min(100, d.pctTotal)} className="mt-2 h-2" />
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 space-y-3">
            {!d.rubricas.length ? (
              <p className="text-sm text-muted-foreground">Sem itens orçamentários cadastrados.</p>
            ) : (
              d.rubricas.map((r) => (
                <div key={r.categoria} className="rounded-md border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-medium">{r.categoria}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatarMoeda(r.executado)} / {formatarMoeda(r.previsto)}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={Math.min(100, r.pct)} className="h-2" />
                    <span className="w-14 text-right text-xs font-medium">{r.pct.toFixed(1)}%</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <AnaliseIA
            aba="orcamentario"
            projetoNome={projetoNome}
            getContexto={getContexto}
            disabled={!d.rubricas.length}
          />
        </>
      )}
    </div>
  );
}