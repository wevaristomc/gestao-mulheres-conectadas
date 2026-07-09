import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronRight, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveContext, useHasRole } from "@/hooks/use-active-context";
import { turmasListOptions, pickFirst, formatarData, deleteTurma, nomeTurma, type Row } from "@/lib/pedagogico-queries";
import { TurmaDialog } from "@/components/turma-dialog";

export const Route = createFileRoute("/_authenticated/pedagogico/")({
  component: PedagogicoIndex,
});

function PedagogicoIndex() {
  const { projetoId, projetoNome } = useActiveContext();
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico"]);
  const qc = useQueryClient();
  const q = useQuery(turmasListOptions(projetoId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => deleteTurma(id),
    onSuccess: () => {
      toast.success("Turma excluída");
      qc.invalidateQueries({ queryKey: ["pedagogico", "turmas"] });
      qc.invalidateQueries({ queryKey: ["administrativo", "turmas"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  return (
    <div>
      <PageHeader
        title="Pedagógico"
        description={
          projetoNome
            ? `Turmas do projeto · ${projetoNome}`
            : "Selecione um projeto para visualizar as turmas."
        }
        actions={
          canWrite ? (
            <Button
              size="sm"
              disabled={!projetoId}
              onClick={() => { setEditing(null); setDialogOpen(true); }}
            >
              <Plus className="mr-1 h-4 w-4" /> Nova turma
            </Button>
          ) : null
        }
      />

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
                <TableHead>Turma</TableHead>
                <TableHead className="w-32">Turno</TableHead>
                <TableHead className="w-56">Professor(a)</TableHead>
                <TableHead className="w-40">Início</TableHead>
                <TableHead className="w-40">Fim</TableHead>
                <TableHead className="w-40 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma turma cadastrada neste projeto.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r: Row) => {
                  const nome = nomeTurma(r);
                  const turno = pickFirst(r, ["turno", "periodo"]);
                  const inicio = pickFirst(r, ["data_inicio", "inicio", "data_de_inicio"]);
                  const fim = pickFirst(r, ["data_fim", "fim", "data_de_fim"]);
                  const prof = pickFirst(r, ["professor_nome", "professor"]);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/pedagogico/turmas/$id"
                          params={{ id: r.id }}
                          className="hover:underline"
                        >
                          {nome}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{turno ?? "—"}</TableCell>
                      <TableCell className="text-sm">{prof ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatarData(inicio)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatarData(fim)}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {canWrite ? (
                            <>
                              <Button size="icon" variant="ghost" title="Editar"
                                onClick={() => { setEditing(r); setDialogOpen(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Excluir"
                                onClick={() => setDeleting(r)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : null}
                          <Link
                            to="/pedagogico/turmas/$id"
                            params={{ id: r.id }}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline px-2"
                          >
                            Abrir <ChevronRight className="h-3 w-3" />
                          </Link>
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

      {projetoId ? (
        <TurmaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projetoId={projetoId}
          turma={editing}
        />
      ) : null}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir turma?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Aulas, matrículas e frequências vinculadas podem ser afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deleting) delMut.mutate(deleting.id); }}
              disabled={delMut.isPending}
            >
              {delMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}