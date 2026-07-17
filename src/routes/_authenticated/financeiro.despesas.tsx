import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveContext } from "@/hooks/use-active-context";
import { rubricasListOptions } from "@/lib/rubricas-queries";
import {
  deleteDespesa,
  despesasListOptions,
  formatarData,
  formatBRL,
  fornecedoresListOptions,
  orcamentoItensOptions,
  pickFirst,
  toNumber,
  upsertDespesa,
  type Row,
} from "@/lib/financeiro-queries";

export const Route = createFileRoute("/_authenticated/financeiro/despesas")({
  component: DespesasTab,
});

const STATUS_OPTIONS = ["prevista", "aprovada", "paga", "cancelada"] as const;

function statusVariant(s: string | null): "default" | "secondary" | "destructive" | "outline" {
  const v = (s ?? "").toLowerCase();
  if (v === "paga" || v === "pago") return "default";
  if (v === "cancelada") return "destructive";
  if (v === "aprovada") return "secondary";
  return "outline";
}

function DespesasTab() {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();
  const q = useQuery(despesasListOptions(projetoId));
  const fornQ = useQuery(fornecedoresListOptions(projetoId));
  const orcQ = useQuery(orcamentoItensOptions(projetoId));
  const rubQ = useQuery(rubricasListOptions());

  const rows = useMemo(() => q.data?.rows ?? [], [q.data?.rows]);
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  const fornecedoresMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fornQ.data?.rows ?? []) {
      map.set(f.id, String(pickFirst(f, ["nome", "razao_social"]) ?? "—"));
    }
    return map;
  }, [fornQ.data]);

  const orcamentoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orcQ.data?.rows ?? []) {
      const cat = pickFirst(o, ["categoria", "rubrica"]);
      const desc = pickFirst(o, ["descricao", "nome"]);
      map.set(o.id, [cat, desc].filter(Boolean).join(" · ") || "—");
    }
    return map;
  }, [orcQ.data]);

  const [novaOpen, setNovaOpen] = useState(false);
  const [editando, setEditando] = useState<Row | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);

  const excluir = useMutation({
    mutationFn: (id: string) => deleteDespesa(id),
    onSuccess: () => {
      toast.success("Despesa excluída.");
      qc.invalidateQueries({ queryKey: ["financeiro", "despesas", projetoId] });
      qc.invalidateQueries({ queryKey: ["kpi", "execucao-orcamentaria", projetoId] });
      setConfirmarExcluir(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ordenadas = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const da = String(pickFirst(a, ["data", "data_pagamento", "created_at"]) ?? "");
        const db = String(pickFirst(b, ["data", "data_pagamento", "created_at"]) ?? "");
        return db.localeCompare(da);
      }),
    [rows],
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? "Carregando…" : `${ordenadas.length} despesa(s)`}
        </p>
        <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!projetoId}>
              <Plus className="mr-1.5 h-4 w-4" /> Nova despesa
            </Button>
          </DialogTrigger>
          {projetoId ? (
            <DespesaFormDialog
              projetoId={projetoId}
              despesa={null}
              fornecedores={fornQ.data?.rows ?? []}
              orcamentoItens={orcQ.data?.rows ?? []}
              rubricas={rubQ.data?.rows ?? []}
              onClose={() => setNovaOpen(false)}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["financeiro", "despesas", projetoId] });
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
          {/* Mobile cards */}
          <ul className="divide-y md:hidden">
            {q.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="p-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-56" />
                </li>
              ))
            ) : ordenadas.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma despesa lançada.
              </li>
            ) : (
              ordenadas.map((r) => {
                const fornecedorId = pickFirst(r, ["fornecedor_id"]);
                const orcId = pickFirst(r, ["orcamento_item_id", "item_orcamento_id"]);
                const status = pickFirst(r, ["status", "situacao"]);
                return (
                  <li key={r.id} className="flex min-w-0 items-start justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="break-words text-sm font-semibold">
                        {(pickFirst(r, ["descricao", "titulo", "historico"]) as string) ?? "—"}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {formatarData(pickFirst(r, ["data", "data_pagamento", "created_at"]))}
                        </span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {formatBRL(toNumber(r.valor))}
                        </span>
                        {status ? (
                          <Badge variant={statusVariant(status)} className="capitalize">
                            {status}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="break-words text-xs text-muted-foreground">
                        {orcId ? (orcamentoMap.get(orcId) ?? "—") : "—"}
                        {fornecedorId ? ` • ${fornecedoresMap.get(fornecedorId) ?? ""}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => setEditando(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => setConfirmarExcluir(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Rubrica</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="w-28 text-right">Valor</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : ordenadas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma despesa lançada. Use "Nova despesa" para iniciar.
                    </TableCell>
                  </TableRow>
                ) : (
                  ordenadas.map((r) => {
                    const fornecedorId = pickFirst(r, ["fornecedor_id"]);
                    const orcId = pickFirst(r, ["orcamento_item_id", "item_orcamento_id"]);
                    const status = pickFirst(r, ["status", "situacao"]);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="tabular-nums text-sm">
                          {formatarData(pickFirst(r, ["data", "data_pagamento", "created_at"]))}
                        </TableCell>
                        <TableCell className="font-medium">
                          {pickFirst(r, ["descricao", "titulo", "historico"]) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {orcId ? (orcamentoMap.get(orcId) ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {fornecedorId ? (fornecedoresMap.get(fornecedorId) ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(toNumber(r.valor))}
                        </TableCell>
                        <TableCell>
                          {status ? (
                            <Badge variant={statusVariant(status)} className="capitalize">
                              {status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setEditando(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmarExcluir(r.id)}
                            >
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
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && projetoId ? (
          <DespesaFormDialog
            projetoId={projetoId}
            despesa={editando}
            fornecedores={fornQ.data?.rows ?? []}
            orcamentoItens={orcQ.data?.rows ?? []}
            rubricas={rubQ.data?.rows ?? []}
            onClose={() => setEditando(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["financeiro", "despesas", projetoId] });
              qc.invalidateQueries({ queryKey: ["kpi", "execucao-orcamentaria", projetoId] });
              setEditando(null);
            }}
          />
        ) : null}
      </Dialog>

      <AlertDialog open={!!confirmarExcluir} onOpenChange={(o) => !o && setConfirmarExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir despesa</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
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

function DespesaFormDialog({
  projetoId,
  despesa,
  fornecedores,
  orcamentoItens,
  rubricas,
  onClose,
  onSaved,
}: {
  projetoId: string;
  despesa: Row | null;
  fornecedores: Row[];
  orcamentoItens: Row[];
  rubricas: Row[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [descricao, setDescricao] = useState(
    despesa ? String(pickFirst(despesa, ["descricao", "titulo", "historico"]) ?? "") : "",
  );
  const [valor, setValor] = useState(despesa ? String(toNumber(despesa.valor)) : "");
  const [data, setData] = useState(
    despesa ? String(despesa.data ?? despesa.data_pagamento ?? "").slice(0, 10) : "",
  );
  const [fornecedorId, setFornecedorId] = useState<string>(
    despesa ? String(despesa.fornecedor_id ?? "") : "",
  );
  const [orcamentoId, setOrcamentoId] = useState<string>(
    despesa ? String(despesa.orcamento_item_id ?? "") : "",
  );
  const [rubricaId, setRubricaId] = useState<string>(
    despesa ? String(despesa.rubrica_id ?? "") : "",
  );
  const [status, setStatus] = useState<string>(despesa ? String(despesa.status ?? "") : "prevista");

  const salvar = useMutation({
    mutationFn: () =>
      upsertDespesa({
        id: despesa?.id,
        projeto_id: projetoId,
        descricao: descricao.trim() || null,
        valor: toNumber(valor),
        data: data || null,
        fornecedor_id: fornecedorId || null,
        orcamento_item_id: orcamentoId || null,
        rubrica_id: rubricaId || null,
        status: status || null,
      }),
    onSuccess: () => {
      toast.success(despesa ? "Despesa atualizada." : "Despesa criada.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeSalvar = toNumber(valor) > 0 && descricao.trim().length > 0;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{despesa ? "Editar despesa" : "Nova despesa"}</DialogTitle>
        <DialogDescription>
          Vincule à rubrica orçamentária e ao fornecedor para consolidar o executado.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="d-desc">Descrição</Label>
          <Input id="d-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="d-valor">Valor (R$)</Label>
            <Input
              id="d-valor"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,-]/g, ""))}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-data">Data</Label>
            <Input id="d-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Rubrica orçamentária</Label>
          <Select
            value={orcamentoId || "__none__"}
            onValueChange={(v) => setOrcamentoId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem vínculo</SelectItem>
              {orcamentoItens.map((o) => {
                const cat = pickFirst(o, ["categoria", "rubrica"]);
                const desc = pickFirst(o, ["descricao", "nome"]);
                const label = [cat, desc].filter(Boolean).join(" · ") || o.id;
                return (
                  <SelectItem key={o.id} value={o.id}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Rubrica do plano de trabalho</Label>
          <Select
            value={rubricaId || "__none__"}
            onValueChange={(v) => setRubricaId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem vínculo</SelectItem>
              {rubricas.map((rubrica) => (
                <SelectItem key={rubrica.id} value={rubrica.id}>
                  {[pickFirst(rubrica, ["codigo"]), pickFirst(rubrica, ["nome", "descricao"])]
                    .filter(Boolean)
                    .join(" · ") || rubrica.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Este vínculo atualiza automaticamente o executado e o saldo da rubrica.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Fornecedor</Label>
          <Select
            value={fornecedorId || "__none__"}
            onValueChange={(v) => setFornecedorId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem fornecedor</SelectItem>
              {fornecedores.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {pickFirst(f, ["nome", "razao_social"]) ?? f.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status || "prevista"} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => salvar.mutate()} disabled={!podeSalvar || salvar.isPending}>
          {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
