import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { gerarMatriculasDoAva } from "@/lib/ava-matriculas.functions";

type Resultado = {
  criadas: number;
  atualizadas: number;
  ignoradas: number;
  total_pares: number;
};

export function GerarMatriculasAvaCard() {
  const qc = useQueryClient();
  const gerar = useServerFn(gerarMatriculasDoAva);
  const run = useMutation({
    mutationFn: async () => (await gerar()) as Resultado,
    onSuccess: (r) => {
      toast.success(
        `Matrículas: ${r.criadas} criadas · ${r.atualizadas} atualizadas · ${r.ignoradas} ignoradas`,
      );
      qc.invalidateQueries({ queryKey: ["mte"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao gerar matrículas"),
  });

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Gerar matrículas a partir do AVA
        </h3>
        <p className="text-xs text-muted-foreground">
          Cria/atualiza matrículas em <strong>Turma × Beneficiária</strong> para todos os
          pares já cruzados pela importação do dump (aluna com CPF vinculado à beneficiária
          e curso vinculado à turma). Status derivado: <em>concluinte</em> quando há nota
          final de curso &gt; 0 com prazo encerrado; <em>evadida</em> quando a inscrição
          está suspensa; senão <em>cursando</em>. Operação idempotente. Somente
          administradores.
        </p>
      </div>

      <div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Users className="mr-2 h-4 w-4" />
          )}
          Gerar matrículas
        </Button>
      </div>

      {run.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="whitespace-pre-wrap break-words">{(run.error as Error).message}</div>
        </div>
      ) : null}

      {run.data ? (
        <div className="rounded-md border p-2 text-xs space-y-1">
          <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Concluído
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-muted-foreground">
            <div>Criadas: <strong className="text-foreground">{run.data.criadas}</strong></div>
            <div>Atualizadas: <strong className="text-foreground">{run.data.atualizadas}</strong></div>
            <div>Ignoradas: <strong className="text-foreground">{run.data.ignoradas}</strong></div>
            <div>Total pares: <strong className="text-foreground">{run.data.total_pares}</strong></div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            "Ignoradas" = inscrição AVA sem beneficiária ou sem turma correspondente
            (falta cruzar CPF ou código de turma).
          </p>
        </div>
      ) : null}
    </div>
  );
}