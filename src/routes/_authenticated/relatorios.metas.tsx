import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useActiveContext } from "@/hooks/use-active-context";
import { metasResumoOptions } from "@/lib/relatorios-queries";
import { AnaliseIA } from "@/components/analise-ia";

export const Route = createFileRoute("/_authenticated/relatorios/metas")({
  component: Metas,
});

function MetaCard({
  titulo, real, meta, sufixo, extra,
}: {
  titulo: string;
  real: number;
  meta: number | null;
  sufixo?: string;
  extra?: React.ReactNode;
}) {
  const pct = meta && meta > 0 ? Math.min(100, (real / meta) * 100) : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">
          {real}
          {sufixo ? <span className="text-base font-normal text-muted-foreground">{sufixo}</span> : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Meta: {meta ?? "—"}{sufixo ?? ""}
        </div>
        {pct !== null ? (
          <div className="mt-3 flex items-center gap-2">
            <Progress value={pct} className="h-2" />
            <span className="w-14 text-right text-xs font-medium">{pct.toFixed(0)}%</span>
          </div>
        ) : null}
        {extra ? <div className="mt-3">{extra}</div> : null}
      </CardContent>
    </Card>
  );
}

function Metas() {
  const { projetoId, projetoNome } = useActiveContext();
  const q = useQuery(metasResumoOptions(projetoId));
  const d = q.data;

  function getContexto(): string | null {
    if (!d) return null;
    const pct = (r: number, m: number | null) =>
      m && m > 0 ? `${((r / m) * 100).toFixed(1)}%` : "sem meta definida";
    return [
      `Metas do projeto vs realizado:`,
      `- Cursistas: ${d.cursistas.real} de ${d.cursistas.meta} (${pct(d.cursistas.real, d.cursistas.meta)}).`,
      `- Turmas: ${d.turmas.real} de ${d.turmas.meta} (${pct(d.turmas.real, d.turmas.meta)}).`,
      `- Carga horária: ${d.horas.real}h de ${d.horas.meta}h (${pct(d.horas.real, d.horas.meta)}).`,
      `- Municípios atendidos: ${d.municipios.real}${d.municipios.meta ? ` de ${d.municipios.meta}` : ""} (${d.municipios.lista.join(", ") || "não informado"}).`,
    ].join("\n");
  }

  return (
    <div>
      <PageHeader
        title="Metas do Projeto"
        description={projetoNome ? `Meta vs realizado · ${projetoNome}` : "Selecione um projeto"}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetaCard titulo="Cursistas" real={d.cursistas.real} meta={d.cursistas.meta} />
            <MetaCard titulo="Turmas" real={d.turmas.real} meta={d.turmas.meta} />
            <MetaCard titulo="Carga horária" real={d.horas.real} meta={d.horas.meta} sufixo="h" />
            <MetaCard
              titulo="Municípios atendidos"
              real={d.municipios.real}
              meta={d.municipios.meta}
              extra={
                d.municipios.lista.length ? (
                  <div className="flex flex-wrap gap-1">
                    {d.municipios.lista.slice(0, 12).map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                    ))}
                    {d.municipios.lista.length > 12 ? (
                      <span className="text-[10px] text-muted-foreground">
                        +{d.municipios.lista.length - 12}
                      </span>
                    ) : null}
                  </div>
                ) : null
              }
            />
          </div>

          <AnaliseIA aba="metas" projetoNome={projetoNome} getContexto={getContexto} />
        </>
      )}
    </div>
  );
}