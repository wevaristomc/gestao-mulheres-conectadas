import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveContext } from "@/hooks/use-active-context";
import { acompanhamentoOptions } from "@/lib/relatorios-queries";
import { gerarRelatorioInteligente } from "@/lib/relatorios.functions";

export const Route = createFileRoute("/_authenticated/relatorios/inteligente")({
  component: Inteligente,
});

function Inteligente() {
  const { projetoId, projetoNome } = useActiveContext();
  const q = useQuery(acompanhamentoOptions(projetoId));
  const call = useServerFn(gerarRelatorioInteligente);
  const [texto, setTexto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function gerar() {
    if (!projetoId || !q.data) return;
    setLoading(true);
    setTexto(null);
    try {
      const d = q.data;
      const res = await call({
        data: {
          projetoId,
          resumo: {
            projetoNome: d.projeto?.nome ?? projetoNome ?? null,
            dataInicio: d.projeto?.data_inicio ?? null,
            dataFim: d.projeto?.data_fim ?? null,
            diasRestantes: d.diasRestantes,
            valorGlobal: d.projeto?.valor_global ?? null,
            turmas: d.turmas,
            cursistasAtivas: d.cursistasAtivas,
            aulasRealizadas: d.aulasRealizadas,
            aulasPrevistas: d.aulasPrevistas,
            frequenciaMedia: d.frequenciaMedia,
            orcamentoPrevisto: d.execucaoOrcamentaria?.previsto ?? null,
            orcamentoExecutado: d.execucaoOrcamentaria?.executado ?? null,
            orcamentoPct: d.execucaoOrcamentaria?.pct ?? null,
          },
        },
      });
      setTexto(res.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar relatório");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Relatório Inteligente"
        description="Parecer executivo gerado por IA com base nos indicadores do projeto ativo."
        actions={
          <Button onClick={gerar} disabled={!projetoId || q.isLoading || loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Gerar resumo
          </Button>
        }
      />

      {!projetoId ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Selecione um projeto para gerar o relatório.
        </div>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : texto ? (
        <Card>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none py-4 whitespace-pre-wrap">
            {texto}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Clique em <strong>Gerar resumo</strong> para produzir um parecer executivo com pontos fortes, riscos e recomendações.
        </p>
      )}
    </div>
  );
}