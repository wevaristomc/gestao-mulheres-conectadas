import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveContext } from "@/hooks/use-active-context";
import { frequenciaResumoOptions } from "@/lib/relatorios-queries";
import { AnaliseIA } from "@/components/analise-ia";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/relatorios/frequencia")({
  component: Frequencia,
});

function Frequencia() {
  const { projetoId, projetoNome } = useActiveContext();
  const q = useQuery(frequenciaResumoOptions(projetoId));
  const d = q.data;

  function exportar() {
    if (!d) return;
    const rows: Array<Record<string, unknown>> = [];
    for (const t of d.turmas) {
      for (const c of t.cursistas) {
        rows.push({
          turma: t.turmaNome,
          cursista: c.nome,
          aulas: c.aulasTotal,
          presencas: c.presencas,
          faltas: c.faltas,
          percentual: c.pct.toFixed(1).replace(".", ","),
        });
      }
    }
    const csv = toCSV(rows, ["turma", "cursista", "aulas", "presencas", "faltas", "percentual"]);
    downloadCSV(`frequencia-${projetoNome ?? "projeto"}.csv`, csv);
  }

  function getContexto(): string | null {
    if (!d || !d.turmas.length) return null;
    const linhas: string[] = [];
    for (const t of d.turmas) {
      const abaixo = t.cursistas.filter((c) => c.pct < 75).length;
      const media = t.cursistas.length
        ? t.cursistas.reduce((s, c) => s + c.pct, 0) / t.cursistas.length
        : 0;
      linhas.push(
        `- Turma "${t.turmaNome}": ${t.cursistas.length} cursistas, ${t.aulasTotal} aulas, frequência média ${media.toFixed(1)}%, ${abaixo} cursistas abaixo de 75%.`,
      );
    }
    return `Panorama de frequência por turma:\n${linhas.join("\n")}`;
  }

  return (
    <div>
      <PageHeader
        title="Frequência"
        description={projetoNome ? `Presença por cursista · ${projetoNome}` : "Selecione um projeto"}
        actions={
          <Button size="sm" variant="outline" onClick={exportar} disabled={!d || !d.turmas.length}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        }
      />

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !d ? null : d.errors.length && !d.turmas.length ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{d.errors.join(" · ")}</div>
        </div>
      ) : !d.turmas.length ? (
        <p className="text-sm text-muted-foreground">Sem turmas cadastradas neste projeto.</p>
      ) : (
        <div className="space-y-6">
          {d.turmas.map((t) => (
            <div key={t.turmaId} className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="font-medium">{t.turmaNome}</div>
                <div className="text-xs text-muted-foreground">
                  {t.aulasTotal} aula{t.aulasTotal === 1 ? "" : "s"} · {t.cursistas.length} cursista{t.cursistas.length === 1 ? "" : "s"}
                </div>
              </div>
              {!t.cursistas.length ? (
                <div className="px-3 py-4 text-sm text-muted-foreground">Sem matrículas.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cursista</TableHead>
                      <TableHead className="w-20 text-right">Aulas</TableHead>
                      <TableHead className="w-24 text-right">Presenças</TableHead>
                      <TableHead className="w-20 text-right">Faltas</TableHead>
                      <TableHead className="w-24 text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {t.cursistas.map((c) => {
                      const baixa = c.pct < 75;
                      return (
                        <TableRow key={c.cursistaId} className={baixa ? "bg-destructive/5" : undefined}>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{c.aulasTotal}</TableCell>
                          <TableCell className="text-right">{c.presencas}</TableCell>
                          <TableCell className="text-right">{c.faltas}</TableCell>
                          <TableCell className="text-right">
                            {baixa ? (
                              <Badge variant="destructive">{c.pct.toFixed(1)}%</Badge>
                            ) : (
                              <span className="font-medium">{c.pct.toFixed(1)}%</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          ))}

          <AnaliseIA
            aba="frequencia"
            projetoNome={projetoNome}
            getContexto={getContexto}
            disabled={!d.turmas.length}
          />
        </div>
      )}
    </div>
  );
}