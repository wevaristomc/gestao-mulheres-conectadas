import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveContext } from "@/hooks/use-active-context";
import { pedagogicoResumoOptions } from "@/lib/relatorios-queries";
import { AnaliseIA } from "@/components/analise-ia";

export const Route = createFileRoute("/_authenticated/relatorios/pedagogico")({
  component: Pedagogico,
});

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

function Pedagogico() {
  const { projetoId, projetoNome } = useActiveContext();
  const q = useQuery(pedagogicoResumoOptions(projetoId));
  const d = q.data;

  function getContexto(): string | null {
    if (!d || !d.turmas.length) return null;
    const linhas = d.turmas.map(
      (t) =>
        `- ${t.turmaNome}: ${t.qualificados}/${t.matriculados} qualificados (${t.taxa.toFixed(1)}%), ${t.certificados} certificados emitidos.`,
    );
    return `Totais: ${d.totalQualificados}/${d.totalMatriculados} qualificados; ${d.totalCertificados} certificados emitidos.\nPor turma:\n${linhas.join("\n")}`;
  }

  const taxaGlobal = d && d.totalMatriculados > 0 ? (d.totalQualificados / d.totalMatriculados) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Pedagógico"
        description={projetoNome ? `Qualificação e certificação · ${projetoNome}` : "Selecione um projeto"}
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
            <Kpi title="Matriculadas" value={String(d.totalMatriculados)} />
            <Kpi
              title="Qualificadas"
              value={String(d.totalQualificados)}
              hint={`Taxa global ${taxaGlobal.toFixed(1)}%`}
            />
            <Kpi title="Certificados emitidos" value={String(d.totalCertificados)} />
          </div>

          <div className="mt-6 rounded-md border">
            {!d.turmas.length ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">Sem turmas cadastradas.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Turma</TableHead>
                    <TableHead className="w-32 text-right">Matriculadas</TableHead>
                    <TableHead className="w-32 text-right">Qualificadas</TableHead>
                    <TableHead className="w-32 text-right">Certificados</TableHead>
                    <TableHead className="w-56">Taxa de conclusão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.turmas.map((t) => (
                    <TableRow key={t.turmaId}>
                      <TableCell className="font-medium">{t.turmaNome}</TableCell>
                      <TableCell className="text-right">{t.matriculados}</TableCell>
                      <TableCell className="text-right">{t.qualificados}</TableCell>
                      <TableCell className="text-right">{t.certificados}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, t.taxa)} className="h-2" />
                          <span className="w-14 text-right text-xs text-muted-foreground">
                            {t.taxa.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <AnaliseIA
            aba="pedagogico"
            projetoNome={projetoNome}
            getContexto={getContexto}
            disabled={!d.turmas.length}
          />
        </>
      )}
    </div>
  );
}