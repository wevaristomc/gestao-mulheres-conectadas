import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  atualizarRubricaPrevisto,
  despesasPorRubricaOptions,
  rubricasListOptions,
} from "@/lib/rubricas-queries";
import { formatBRL, toNumber } from "@/lib/financeiro-queries";

export const Route = createFileRoute("/_authenticated/financeiro/rubricas")({
  head: () => ({ meta: [{ title: "Rubricas · Financeiro" }] }),
  component: RubricasPage,
});

function RubricasPage() {
  const qc = useQueryClient();
  const { projetoId } = useActiveContext();
  const rubQ = useQuery(rubricasListOptions());
  const despQ = useQuery(despesasPorRubricaOptions(projetoId));
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");

  const executadoPorRubrica = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (despQ.data?.rows ?? []) as Array<{ rubrica_id: string; total: number }>) {
      m.set(r.rubrica_id, r.total);
    }
    return m;
  }, [despQ.data]);

  const rubricas = rubQ.data?.rows ?? [];
  const erro = rubQ.data?.error ?? (rubQ.isError ? String(rubQ.error) : null);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      await atualizarRubricaPrevisto(editId, toNumber(editVal));
    },
    onSuccess: () => {
      toast.success("Rubrica atualizada.");
      setEditId(null);
      setEditVal("");
      qc.invalidateQueries({ queryKey: ["financeiro", "rubricas"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const totais = useMemo(() => {
    let previsto = 0;
    let executado = 0;
    for (const r of rubricas) {
      previsto += toNumber(r.valor_previsto);
      executado += executadoPorRubrica.get(r.id) ?? 0;
    }
    return { previsto, executado, saldo: previsto - executado };
  }, [rubricas, executadoPorRubrica]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Previsto (rubricas)" value={formatBRL(totais.previsto)} />
        <Kpi label="Executado" value={formatBRL(totais.executado)} />
        <Kpi label="Saldo" value={formatBRL(totais.saldo)} negative={totais.saldo < 0} />
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 break-words">{erro}</div>
        </div>
      ) : null}

      <div className="rounded-md border">
        <ul className="divide-y md:hidden">
          {rubricas.map((r) => {
            const previsto = toNumber(r.valor_previsto);
            const executado = executadoPorRubrica.get(r.id) ?? 0;
            const saldo = previsto - executado;
            const pct = previsto > 0 ? (executado / previsto) * 100 : 0;
            const isEdit = editId === r.id;
            return (
              <li key={r.id} className="p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold">
                      <span className="font-mono text-xs text-muted-foreground">{String(r.codigo ?? "—")}</span>
                      {" · "}{String(r.descricao ?? "—")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Executado <strong className="text-foreground">{formatBRL(executado)}</strong> de {formatBRL(previsto)} ({pct.toFixed(1)}%)
                    </div>
                    <div className={cn("text-xs", saldo < 0 && "text-destructive")}>
                      Saldo: <strong>{formatBRL(saldo)}</strong>
                    </div>
                  </div>
                  {isEdit ? (
                    <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                      {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => { setEditId(r.id); setEditVal(String(previsto)); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {isEdit ? (
                  <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} inputMode="decimal" placeholder="Previsto (R$)" />
                ) : null}
              </li>
            );
          })}
          {!rubricas.length && !rubQ.isLoading ? (
            <li className="p-6 text-center text-sm text-muted-foreground">Nenhuma rubrica cadastrada.</li>
          ) : null}
        </ul>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Previsto</TableHead>
              <TableHead className="text-right">Executado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">% Exec.</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rubricas.map((r) => {
              const previsto = toNumber(r.valor_previsto);
              const executado = executadoPorRubrica.get(r.id) ?? 0;
              const saldo = previsto - executado;
              const pct = previsto > 0 ? (executado / previsto) * 100 : 0;
              const isEdit = editId === r.id;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{String(r.codigo ?? "—")}</TableCell>
                  <TableCell>{String(r.descricao ?? "—")}</TableCell>
                  <TableCell className="text-right">
                    {isEdit ? (
                      <Input
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="ml-auto h-8 w-32 text-right"
                        inputMode="decimal"
                      />
                    ) : (
                      formatBRL(previsto)
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatBRL(executado)}</TableCell>
                  <TableCell className={cn("text-right", saldo < 0 && "text-destructive")}>
                    {formatBRL(saldo)}
                  </TableCell>
                  <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">
                    {isEdit ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => salvar.mutate()}
                        disabled={salvar.isPending}
                      >
                        {salvar.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditId(r.id);
                          setEditVal(String(previsto));
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!rubricas.length && !rubQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma rubrica cadastrada.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", negative ? "text-destructive" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}