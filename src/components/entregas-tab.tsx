import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  cursistasComStatusOptions,
  deleteEntrega,
  entregasListOptions,
  formatBRL,
  formatarData,
  pickFirst,
  turmasDoProjetoOptions,
  upsertEntrega,
  type EntregaTabela,
  type Row,
} from "@/lib/administrativo-queries";
import { compararTurmasPorCodigo, rotuloTurma } from "@/lib/turmas";

type Props = {
  tabela: EntregaTabela;
  titulo: string;
  labelDescricao: string;
  mostrarValor: boolean;
  statuses: string[];
};

type FormState = {
  id?: string;
  turmaId: string | null;
  matriculaId: string | null;
  cursistaId: string | null;
  descricao: string;
  quantidade: string;
  valor: string;
  dataEntrega: string;
  status: string;
  observacoes: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(statuses: string[]): FormState {
  return {
    turmaId: null,
    matriculaId: null,
    cursistaId: null,
    descricao: "",
    quantidade: "1",
    valor: "",
    dataEntrega: today(),
    status: statuses[0] ?? "entregue",
    observacoes: "",
  };
}

export function EntregasTab({ tabela, titulo, labelDescricao, mostrarValor, statuses }: Props) {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();
  const listQ = useQuery(entregasListOptions(tabela, projetoId));
  const turmasQ = useQuery(turmasDoProjetoOptions(projetoId));
  const rows = listQ.data?.rows ?? [];
  const erro = listQ.data?.error;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(statuses));

  const cursistasQ = useQuery(cursistasComStatusOptions(form.turmaId));
  const cursistas = cursistasQ.data?.rows ?? [];
  const turmasOrdenadas = useMemo(
    () => [...(turmasQ.data?.rows ?? [])].sort(compararTurmasPorCodigo),
    [turmasQ.data?.rows],
  );

  const abrirNovo = () => {
    setForm(emptyForm(statuses));
    setOpen(true);
  };

  const abrirEditar = (r: Row) => {
    setForm({
      id: r.id,
      turmaId: (r.turma_id as string) ?? null,
      matriculaId: (r.matricula_id as string) ?? null,
      cursistaId: (r.cursista_id as string) ?? null,
      descricao: (r.descricao as string) ?? "",
      quantidade: r.quantidade != null ? String(r.quantidade) : "1",
      valor: r.valor != null ? String(r.valor) : "",
      dataEntrega: ((r.data_entrega as string) ?? today()).slice(0, 10),
      status: (r.status as string) ?? statuses[0] ?? "entregue",
      observacoes: (r.observacoes as string) ?? "",
    });
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.descricao.trim()) throw new Error("Descrição é obrigatória.");
      await upsertEntrega(tabela, {
        id: form.id,
        projetoId,
        turmaId: form.turmaId,
        cursistaId: form.cursistaId,
        matriculaId: form.matriculaId,
        descricao: form.descricao.trim(),
        quantidade: form.quantidade ? Number(form.quantidade) : null,
        valor: mostrarValor && form.valor ? Number(form.valor) : null,
        dataEntrega: form.dataEntrega,
        status: form.status,
        observacoes: form.observacoes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(form.id ? "Entrega atualizada." : "Entrega registrada.");
      qc.invalidateQueries({ queryKey: ["administrativo", tabela] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteEntrega(tabela, id),
    onSuccess: () => {
      toast.success("Entrega removida.");
      qc.invalidateQueries({ queryKey: ["administrativo", tabela] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {listQ.isLoading ? "…" : `${rows.length} ${titulo.toLowerCase()} registrada(s)`}
        </div>
        <Button size="sm" onClick={abrirNovo} disabled={!projetoId}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Nova entrega
        </Button>
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Tabela {tabela} indisponível</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <ul className="divide-y md:hidden">
            {listQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="p-3">
                  <Skeleton className="h-4 w-40" />
                </li>
              ))
            ) : rows.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma entrega registrada.
              </li>
            ) : (
              rows.map((r) => {
                const cursista = (r.cursistas as Row | null | undefined) ?? null;
                const turma = (r.turmas as Row | null | undefined) ?? null;
                const cursistaNome =
                  pickFirst(cursista, ["nome", "nome_completo"]) ??
                  (r.cursista_id as string | undefined) ??
                  "—";
                const turmaNome = turma ? rotuloTurma(turma) : null;
                return (
                  <li key={r.id} className="flex min-w-0 items-start justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="break-words text-sm font-semibold">
                        {(r.descricao as string) ?? "—"}
                      </div>
                      <div className="break-words text-xs text-muted-foreground">
                        {cursistaNome}
                        {turmaNome ? ` • ${turmaNome}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatarData(r.data_entrega as string)}</span>
                        {r.quantidade != null ? <span>Qtd: {String(r.quantidade)}</span> : null}
                        {mostrarValor && r.valor != null ? (
                          <span>{formatBRL(Number(r.valor))}</span>
                        ) : null}
                        <Badge variant="secondary" className="capitalize">
                          {(r.status as string) ?? "—"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10"
                        onClick={() => abrirEditar(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10"
                        onClick={() => {
                          if (confirm("Remover esta entrega?")) deleteMut.mutate(r.id);
                        }}
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
                  <TableHead className="w-32">Data</TableHead>
                  <TableHead>{labelDescricao}</TableHead>
                  <TableHead>Cursista / Turma</TableHead>
                  <TableHead className="w-24">Qtd.</TableHead>
                  {mostrarValor ? <TableHead className="w-32">Valor</TableHead> : null}
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={mostrarValor ? 7 : 6}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={mostrarValor ? 7 : 6}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      Nenhuma entrega registrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const cursista = (r.cursistas as Row | null | undefined) ?? null;
                    const turma = (r.turmas as Row | null | undefined) ?? null;
                    const cursistaNome =
                      pickFirst(cursista, ["nome", "nome_completo"]) ??
                      (r.cursista_id as string | undefined) ??
                      "—";
                    const turmaNome = turma ? rotuloTurma(turma) : null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatarData(r.data_entrega as string)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {(r.descricao as string) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{cursistaNome}</div>
                          {turmaNome ? (
                            <div className="text-xs text-muted-foreground">{turmaNome}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>{r.quantidade != null ? String(r.quantidade) : "—"}</TableCell>
                        {mostrarValor ? (
                          <TableCell>
                            {r.valor != null ? formatBRL(Number(r.valor)) : "—"}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {(r.status as string) ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => abrirEditar(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Remover esta entrega?")) deleteMut.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar entrega" : "Nova entrega"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>{labelDescricao}</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Turma</Label>
                <Select
                  value={form.turmaId ?? undefined}
                  onValueChange={(v) =>
                    setForm({ ...form, turmaId: v, matriculaId: null, cursistaId: null })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {turmasOrdenadas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {rotuloTurma(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cursista</Label>
                <Select
                  value={form.matriculaId ?? undefined}
                  onValueChange={(v) => {
                    const c = cursistas.find((x) => x.matriculaId === v);
                    setForm({
                      ...form,
                      matriculaId: v,
                      cursistaId: c?.cursistaId ?? null,
                    });
                  }}
                  disabled={!form.turmaId || cursistasQ.isLoading}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={form.turmaId ? "Selecione" : "Escolha uma turma"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cursistas.map((c) => (
                      <SelectItem key={c.matriculaId} value={c.matriculaId}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={form.dataEntrega}
                  onChange={(e) => setForm({ ...form, dataEntrega: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                  className="mt-1"
                />
              </div>
              {mostrarValor ? (
                <div>
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    className="mt-1"
                  />
                </div>
              ) : (
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {mostrarValor ? (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
