import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  deleteFornecedor,
  fornecedoresListOptions,
  pickFirst,
  upsertFornecedor,
  type Row,
} from "@/lib/financeiro-queries";

export const Route = createFileRoute("/_authenticated/financeiro/fornecedores")({
  component: FornecedoresTab,
});

function FornecedoresTab() {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();
  const q = useQuery(fornecedoresListOptions(projetoId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  const [novaOpen, setNovaOpen] = useState(false);
  const [editando, setEditando] = useState<Row | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);

  const excluir = useMutation({
    mutationFn: (id: string) => deleteFornecedor(id),
    onSuccess: () => {
      toast.success("Fornecedor excluído.");
      qc.invalidateQueries({ queryKey: ["financeiro", "fornecedores", projetoId] });
      setConfirmarExcluir(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ordenados = useMemo(
    () =>
      [...rows].sort((a, b) =>
        String(pickFirst(a, ["nome", "razao_social"]) ?? "").localeCompare(
          String(pickFirst(b, ["nome", "razao_social"]) ?? ""),
        ),
      ),
    [rows],
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? "Carregando…" : `${ordenados.length} fornecedor(es)`}
        </p>
        <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!projetoId}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo fornecedor
            </Button>
          </DialogTrigger>
          {projetoId ? (
            <FornecedorFormDialog
              projetoId={projetoId}
              fornecedor={null}
              onClose={() => setNovaOpen(false)}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["financeiro", "fornecedores", projetoId] });
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
          <ul className="divide-y md:hidden">
            {q.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="p-3"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-56" /></li>
              ))
            ) : ordenados.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</li>
            ) : ordenados.map((r) => (
              <li key={r.id} className="flex min-w-0 items-start justify-between gap-2 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="break-words text-sm font-semibold">
                    {(pickFirst(r, ["nome", "razao_social", "fantasia"]) as string) ?? "—"}
                  </div>
                  <div className="break-words text-xs text-muted-foreground">
                    CNPJ: {(pickFirst(r, ["cnpj", "documento"]) as string) ?? "—"}
                  </div>
                  <div className="break-words text-xs text-muted-foreground">
                    {(pickFirst(r, ["email", "contato_email"]) as string) ?? "—"}
                    {(pickFirst(r, ["telefone", "fone", "contato_telefone"]) as string)
                      ? ` • ${pickFirst(r, ["telefone", "fone", "contato_telefone"])}`
                      : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setEditando(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setConfirmarExcluir(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / Razão social</TableHead>
                <TableHead className="w-40">CNPJ</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-36">Telefone</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : ordenados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum fornecedor cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                ordenados.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {pickFirst(r, ["nome", "razao_social", "fantasia"]) ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {pickFirst(r, ["cnpj", "documento"]) ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {pickFirst(r, ["email", "contato_email"]) ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {pickFirst(r, ["telefone", "fone", "contato_telefone"]) ?? "—"}
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
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        {editando && projetoId ? (
          <FornecedorFormDialog
            projetoId={projetoId}
            fornecedor={editando}
            onClose={() => setEditando(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["financeiro", "fornecedores", projetoId] });
              setEditando(null);
            }}
          />
        ) : null}
      </Dialog>

      <AlertDialog open={!!confirmarExcluir} onOpenChange={(o) => !o && setConfirmarExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor</AlertDialogTitle>
            <AlertDialogDescription>
              Despesas ligadas a este fornecedor podem perder a referência. Confirma?
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

function FornecedorFormDialog({
  projetoId,
  fornecedor,
  onClose,
  onSaved,
}: {
  projetoId: string;
  fornecedor: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(
    fornecedor ? String(pickFirst(fornecedor, ["nome", "razao_social"]) ?? "") : "",
  );
  const [cnpj, setCnpj] = useState(
    fornecedor ? String(pickFirst(fornecedor, ["cnpj", "documento"]) ?? "") : "",
  );
  const [email, setEmail] = useState(
    fornecedor ? String(pickFirst(fornecedor, ["email"]) ?? "") : "",
  );
  const [telefone, setTelefone] = useState(
    fornecedor ? String(pickFirst(fornecedor, ["telefone", "fone"]) ?? "") : "",
  );

  const salvar = useMutation({
    mutationFn: () =>
      upsertFornecedor({
        id: fornecedor?.id,
        projeto_id: projetoId,
        nome: nome.trim(),
        cnpj: cnpj.trim() || null,
        email: email.trim() || null,
        telefone: telefone.trim() || null,
      }),
    onSuccess: () => {
      toast.success(fornecedor ? "Fornecedor atualizado." : "Fornecedor criado.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeSalvar = nome.trim().length >= 2;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{fornecedor ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        <DialogDescription>Apenas o nome é obrigatório; demais campos são opcionais.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-nome">Nome / Razão social</Label>
          <Input id="f-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="f-cnpj">CNPJ</Label>
            <Input id="f-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-tel">Telefone</Label>
            <Input id="f-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-email">E-mail</Label>
          <Input id="f-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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