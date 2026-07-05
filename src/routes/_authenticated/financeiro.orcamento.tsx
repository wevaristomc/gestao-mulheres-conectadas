import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  deleteOrcamentoItem,
  formatBRL,
  orcamentoItensOptions,
  pickFirst,
  toNumber,
  upsertOrcamentoItem,
  type Row,
} from "@/lib/financeiro-queries";

export const Route = createFileRoute("/_authenticated/financeiro/orcamento")({
  component: OrcamentoTab,
});

function OrcamentoTab() {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();
  const q = useQuery(orcamentoItensOptions(projetoId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  const [novaOpen, setNovaOpen] = useState(false);
  const [editando, setEditando] = useState<Row | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);

  const excluir = useMutation({
    mutationFn: (id: string) => deleteOrcamentoItem(id),
    onSuccess: () => {
      toast.success("Item excluído.");
      qc.invalidateQueries({ queryKey: ["financeiro", "orcamento", projetoId] });
      qc.invalidateQueries({ queryKey: ["kpi", "execucao-orcamentaria", projetoId] });
      setConfirmarExcluir(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ordenados = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ca = String(pickFirst(a, ["categoria", "rubrica"]) ?? "");
        const cb = String(pickFirst(b, ["categoria", "rubrica"]) ?? "");
        return ca.localeCompare(cb);
      }),
    [rows],
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? "Carregando…" : `${ordenados.length} item(ns) orçamentário(s)`}
        </p>
        <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!projetoId}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo item
            </Button>
          </DialogTrigger>
          {projetoId ? (
            <OrcamentoFormDialog
              projetoId={projetoId}
              item={null}
              onClose={() => setNovaOpen(false)}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["financeiro", "orcamento", projetoId] });
                qc.invalidateQueries({ queryKey: ["kpi", "execucao-orcamentaria", projetoId] });
                setNovaOpen(false);
              }}
            />
          ) : null}
        </Dialog>
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Sem acesso ou tabela indisponível</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rubrica</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-32 text-right">Previsto</TableHead>
                <TableHead className="w-32 text-right">Executado</TableHead>
                <TableHead className="w-44">Execução</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-2 w-full" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : ordenados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum item orçamentário. Use "Novo item" para começar.
                  </TableCell>
                </TableRow>
              ) : (
                ordenados.map((r) => {
                  const previsto = toNumber(r.valor_previsto);
                  const executado = toNumber(r.valor_executado);
                  const pct = previsto > 0 ? (executado / previsto) * 100 : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {pickFirst(r, ["categoria", "rubrica", "grupo"]) ?? "—"}
                      </TableCell>
                      <TableCell>
                        {pickFirst(r, ["descricao", "nome", "item"]) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(previsto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(executado)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(pct, 100)} className="h-2" />
                          <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditando(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmarExcluir(r.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && projetoId ? (
          <OrcamentoFormDialog
            projetoId={projetoId}
            item={editando}
            onClose={() => setEditando(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["financeiro", "orcamento", projetoId] });
              qc.invalidateQueries({ queryKey: ["kpi", "execucao-orcamentaria", projetoId] });
              setEditando(null);
            }}
          />
        ) : null}
      </Dialog>

      <AlertDialog open={!!confirmarExcluir} onOpenChange={(o) => !o && setConfirmarExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item orçamentário</AlertDialogTitle>
            <AlertDialogDescription>
              Despesas vinculadas ao item poderão perder a referência. Confirma?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmarExcluir && excluir.mutate(confirmarExcluir)}
              disabled={excluir.isPending}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrcamentoFormDialog({
  projetoId,
  item,
  onClose,
  onSaved,
}: {
  projetoId: string;
  item: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoria, setCategoria] = useState(
    item ? String(pickFirst(item, ["categoria", "rubrica"]) ?? "") : "",
  );
  const [descricao, setDescricao] = useState(
    item ? String(pickFirst(item, ["descricao", "nome", "item"]) ?? "") : "",
  );
  const [previsto, setPrevisto] = useState(item ? String(toNumber(item.valor_previsto)) : "");
  const [executado, setExecutado] = useState(
    item ? String(toNumber(item.valor_executado)) : "",
  );

  const salvar = useMutation({
    mutationFn: () =>
      upsertOrcamentoItem({
        id: item?.id,
        projeto_id: projetoId,
        descricao: descricao.trim() || null,
        categoria: categoria.trim() || null,
        valor_previsto: toNumber(previsto),
        valor_executado: executado.trim() === "" ? undefined : toNumber(executado),
      }),
    onSuccess: () => {
      toast.success(item ? "Item atualizado." : "Item criado.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeSalvar = toNumber(previsto) > 0;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{item ? "Editar item" : "Novo item orçamentário"}</DialogTitle>
        <DialogDescription>
          Rubrica e valor previsto são obrigatórios. Executado pode ser recalculado pelas despesas.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="o-cat">Rubrica</Label>
          <Input
            id="o-cat"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Ex.: Pessoal / Material / Serviços"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="o-desc">Descrição</Label>
          <Input
            id="o-desc"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Bolsas para professoras"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="o-prev">Valor previsto (R$)</Label>
            <Input
              id="o-prev"
              inputMode="decimal"
              value={previsto}
              onChange={(e) => setPrevisto(e.target.value.replace(/[^0-9.,-]/g, ""))}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-exec">Valor executado (R$)</Label>
            <Input
              id="o-exec"
              inputMode="decimal"
              value={executado}
              onChange={(e) => setExecutado(e.target.value.replace(/[^0-9.,-]/g, ""))}
              placeholder="opcional"
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => salvar.mutate()} disabled={!podeSalvar || salvar.isPending}>
          {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}