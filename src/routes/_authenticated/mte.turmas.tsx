import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TurmaFormDialog } from "@/components/mte/turma-form-dialog";
import { useHasRole } from "@/hooks/use-active-context";
import {
import { useEscopoTurmas } from "@/hooks/use-escopo-turmas";
  turmasMteListOptions, deleteTurmaMTE, faltantesTurma, type TurmaMTE,
} from "@/lib/mte-queries";

export const Route = createFileRoute("/_authenticated/mte/turmas")({
  component: TurmasMteIndex,
});

function TurmasMteIndex() {
  const qc = useQueryClient();
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "administrativo"]);
  const { restrictToUserId } = useEscopoTurmas();
  const q = useQuery(turmasMteListOptions(restrictToUserId));
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TurmaMTE | null>(null);
  const [deleting, setDeleting] = useState<TurmaMTE | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteTurmaMTE(id),
    onSuccess: () => {
      toast.success("Turma excluída");
      qc.invalidateQueries({ queryKey: ["mte", "turmas"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  return (
    <div>
      <PageHeader
        helpId="turma.codigo"
        title="Turmas — Cronograma MTE"
        description="17 campos exigidos pelo Termo de Fomento MTE/SEMP nº 01025/2025."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Nova turma
            </Button>
          ) : null
        }
      />

      {q.data?.error ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {q.data.error}
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Município</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead className="text-center">CH</TableHead>
              <TableHead>Status MTE</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma turma cadastrada.
                </TableCell>
              </TableRow>
            ) : rows.map((t) => {
              const missing = faltantesTurma(t);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.codigo_turma ?? "—"}</TableCell>
                  <TableCell>{t.nome_curso ?? "—"}</TableCell>
                  <TableCell>{t.turno ?? "—"}</TableCell>
                  <TableCell>{t.municipio ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.data_inicio ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.data_fim ?? "—"}</TableCell>
                  <TableCell className="text-center">{t.ch_total ?? "—"}</TableCell>
                  <TableCell>
                    {missing.length === 0 ? (
                      <Badge variant="secondary" className="bg-green-500/15 text-green-700 dark:text-green-400">Completa</Badge>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span title={missing.join(", ")}>Faltam {missing.length}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite ? (
                      <div className="inline-flex items-center gap-1">
                        <Button size="icon" variant="ghost" title="Editar" onClick={() => { setEditing(t); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Excluir" onClick={() => setDeleting(t)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TurmaFormDialog open={dialogOpen} onOpenChange={setDialogOpen} turma={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir turma?</AlertDialogTitle>
            <AlertDialogDescription>
              As matrículas, aulas e presenças vinculadas serão afetadas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deleting) del.mutate(deleting.id); }}
              disabled={del.isPending}
            >
              {del.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}