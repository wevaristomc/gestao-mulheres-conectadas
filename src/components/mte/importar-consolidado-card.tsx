import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Database, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  importarConsolidadoQajbc,
  type ResumoConsolidado,
} from "@/lib/consolidado-qajbc.functions";
import { ALUNAS_SEED, PROFESSORES_SEED, TURMAS_SEED } from "@/data/seed-consolidado";
import { useActiveContext } from "@/hooks/use-active-context";

export function ImportarConsolidadoCard() {
  const qc = useQueryClient();
  const importar = useServerFn(importarConsolidadoQajbc);
  const { projetoId, projetoNome } = useActiveContext();

  const m = useMutation({
    mutationFn: async () =>
      (await importar({ data: { projeto_id: projetoId } })) as ResumoConsolidado,
    onSuccess: (r) => {
      toast.success(
        `Consolidado importado · ${r.turmas_criadas + r.turmas_atualizadas} turmas · ${r.beneficiarias_criadas + r.beneficiarias_atualizadas} beneficiárias · ${r.cursistas_criados + r.cursistas_atualizados} cursistas · ${r.aulas_criadas} aulas`,
      );
      qc.invalidateQueries({ queryKey: ["mte"] });
      qc.invalidateQueries({ queryKey: ["ava"] });
      qc.invalidateQueries({ queryKey: ["pedagogico"] });
      qc.invalidateQueries({ queryKey: ["administrativo"] });
      qc.invalidateQueries({ queryKey: ["relatorios"] });
      qc.invalidateQueries({ queryKey: ["kpi"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha na importação"),
  });

  const r = m.data;

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Database className="h-4 w-4" /> Importação Consolidada QAJBC (Ciclo 1)
        </h3>
        <p className="text-xs text-muted-foreground">
          Popula em um único clique as {TURMAS_SEED.length} turmas do Programa Manuel
          Querino (Betim + Juatuba, ciclo 1, início 09/05/2026), as {ALUNAS_SEED.length}{" "}
          alunas do CSV consolidado e as respectivas matrículas — vinculando ainda os{" "}
          {PROFESSORES_SEED.length} professores titulares. Também espelha as alunas em{" "}
          <strong>cursistas</strong> e cria o esqueleto de <strong>30 aulas × 5h</strong>{" "}
          por turma, alimentando Pedagógico, Administrativo e Relatórios. Idempotente.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Antes do primeiro clique, aplique{" "}
          <code>docs/migrations/consolidado-qajbc.sql</code> e{" "}
          <code>docs/migrations/consolidado-pedagogico.sql</code> no SQL Editor.
        </p>
        <p className="mt-1 text-[11px]">
          Projeto ativo:{" "}
          {projetoId ? (
            <strong>{projetoNome ?? projetoId}</strong>
          ) : (
            <span className="text-destructive">
              nenhum — selecione no topo antes de importar.
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => m.mutate()} disabled={m.isPending || !projetoId}>
          {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
          Rodar importação consolidada
        </Button>
        <Button
          variant="outline"
          onClick={() => m.mutate()}
          disabled={m.isPending || !projetoId}
          title="Reexecuta o importador para recalcular vínculos (projeto, cursistas, aulas)."
        >
          {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Reprocessar vínculos
        </Button>
      </div>

      {m.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="whitespace-pre-wrap break-words">{(m.error as Error).message}</div>
        </div>
      ) : null}

      {r ? (
        <div className="rounded-md border bg-background p-3 text-xs space-y-2">
          <div className="flex items-center gap-2 text-emerald-700 font-medium">
            <CheckCircle2 className="h-4 w-4" /> Importação concluída
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>Turmas criadas: <strong>{r.turmas_criadas}</strong></li>
            <li>Turmas atualizadas: <strong>{r.turmas_atualizadas}</strong></li>
            <li>Turmas vinculadas ao projeto: <strong>{r.turmas_com_projeto}</strong></li>
            <li>Beneficiárias criadas: <strong>{r.beneficiarias_criadas}</strong></li>
            <li>Beneficiárias atualizadas: <strong>{r.beneficiarias_atualizadas}</strong></li>
            <li>Cursistas criadas (Pedagógico): <strong>{r.cursistas_criados}</strong></li>
            <li>Cursistas atualizadas: <strong>{r.cursistas_atualizados}</strong></li>
            <li>Matrículas criadas: <strong>{r.matriculas_criadas}</strong></li>
            <li>Matrículas atualizadas: <strong>{r.matriculas_atualizadas}</strong></li>
            <li>Aulas criadas (esqueleto 150h): <strong>{r.aulas_criadas}</strong></li>
            <li>Professores vinculados: <strong>{r.professores_vinculados}</strong></li>
            <li>Vínculos AVA (moodle_id): <strong>{r.vinculos_ava_por_moodle_id}</strong></li>
            <li>Vínculos AVA (CPF): <strong>{r.vinculos_ava_por_cpf}</strong></li>
            <li>CPFs inválidos: <strong>{r.cpfs_invalidos}</strong></li>
            <li>CPFs duplicados entre turmas: <strong>{r.cpfs_duplicados}</strong></li>
          </ul>
          {r.inconsistencias.length > 0 ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
              <div className="font-medium text-amber-800 mb-1">Avisos:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {r.inconsistencias.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}