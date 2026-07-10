import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2, Package, Pencil, Plus, Trash2, AlertCircle, FileCheck2, FileWarning, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  aulasByTurmaOptions, upsertAula, deleteAula, pickFirst, formatarData, type Row,
  evidenciasCountByTurmaOptions, turmaByIdOptions,
} from "@/lib/pedagogico-queries";
import { DialogGerarListas } from "@/components/pedagogico/dialog-gerar-listas";
import { DialogGerarListasEntrega } from "@/components/pedagogico/dialog-gerar-listas-entrega";
import { AulaComprovacaoDialog } from "@/components/pedagogico/aula-comprovacao-dialog";

export const Route = createFileRoute("/_authenticated/pedagogico/turmas/$id/aulas")({
  component: AulasTab,
});

function AulasTab() {
  const { id: turmaId } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery(aulasByTurmaOptions(turmaId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);
  const turmaQ = useQuery(turmaByIdOptions(turmaId));
  const codigoTurma = (pickFirst(turmaQ.data?.row, ["codigo_turma"]) ?? null) as string | null;
  const countQ = useQuery(evidenciasCountByTurmaOptions(turmaId));
  const countByAula = countQ.data?.byAula ?? {};

  const [novaOpen, setNovaOpen] = useState(false);
  const [editando, setEditando] = useState<Row | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [gerarOpen, setGerarOpen] = useState(false);
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [comprovando, setComprovando] = useState<Row | null>(null);

  const excluir = useMutation({
    mutationFn: (id: string) => deleteAula(id),
    onSuccess: () => {
      toast.success("Aula excluída.");
      qc.invalidateQueries({ queryKey: ["pedagogico", "aulas", turmaId] });
      qc.invalidateQueries({ queryKey: ["pedagogico", "frequencia", turmaId] });
      setConfirmarExcluir(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aulasOrdenadas = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = String(a.data ?? "");
      const db = String(b.data ?? "");
      return da.localeCompare(db);
    });
  }, [rows]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? "Carregando…" : `${aulasOrdenadas.length} aula(s)`}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setGerarOpen(true)}>
            <ClipboardList className="mr-1.5 h-4 w-4" /> Gerar listas de presença
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEntregaOpen(true)}>
            <Package className="mr-1.5 h-4 w-4" /> Listas de entrega
          </Button>
          <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Nova aula</Button>
          </DialogTrigger>
          <AulaFormDialog
            turmaId={turmaId}
            aula={null}
            onClose={() => setNovaOpen(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["pedagogico", "aulas", turmaId] });
              qc.invalidateQueries({ queryKey: ["pedagogico", "frequencia", turmaId] });
              setNovaOpen(false);
            }}
          />
          </Dialog>
        </div>
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
                <TableHead className="w-40">Data</TableHead>
                <TableHead>Tema</TableHead>
                <TableHead className="w-24">Duração</TableHead>
                <TableHead className="w-44">Comprovação</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : aulasOrdenadas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma aula cadastrada. Use "Nova aula" para lançar a primeira.
                  </TableCell>
                </TableRow>
              ) : (
                aulasOrdenadas.map((r) => {
                  const n = countByAula[r.id] ?? 0;
                  return (
                  <TableRow key={r.id}>
                    <TableCell>{formatarData(pickFirst(r, ["data"]))}</TableCell>
                    <TableCell>{pickFirst(r, ["titulo", "tema", "assunto", "descricao"]) ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {pickFirst(r, ["duracao", "carga_horaria"]) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {n > 0 ? (
                          <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                            <FileCheck2 className="mr-1 h-3 w-3" /> Comprovada ({n})
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <FileWarning className="mr-1 h-3 w-3" /> Sem comprovação
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setComprovando(r)}
                        >
                          <Paperclip className="mr-1 h-3 w-3" /> Anexar
                        </Button>
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
        {editando ? (
          <AulaFormDialog
            turmaId={turmaId}
            aula={editando}
            onClose={() => setEditando(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["pedagogico", "aulas", turmaId] });
              qc.invalidateQueries({ queryKey: ["pedagogico", "frequencia", turmaId] });
              setEditando(null);
            }}
          />
        ) : null}
      </Dialog>

      <AlertDialog open={!!confirmarExcluir} onOpenChange={(o) => !o && setConfirmarExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aula</AlertDialogTitle>
            <AlertDialogDescription>
              A aula e as frequências vinculadas podem ser afetadas. Confirma a exclusão?
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

      <DialogGerarListas open={gerarOpen} onOpenChange={setGerarOpen} turmaId={turmaId} />
      <DialogGerarListasEntrega open={entregaOpen} onOpenChange={setEntregaOpen} turmaId={turmaId} />

      {comprovando ? (
        <AulaComprovacaoDialog
          open={!!comprovando}
          onOpenChange={(o) => !o && setComprovando(null)}
          turmaId={turmaId}
          aulaId={comprovando.id}
          codigoTurma={codigoTurma}
          dataAula={pickFirst(comprovando, ["data"])}
        />
      ) : null}
    </div>
  );
}

function AulaFormDialog({
  turmaId, aula, onClose, onSaved,
}: {
  turmaId: string;
  aula: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialData = aula ? String(aula.data ?? "").slice(0, 10) : "";
  const initialTitulo = aula ? String(aula.titulo ?? aula.tema ?? aula.assunto ?? "") : "";
  const initialDuracao = aula ? String(aula.duracao ?? aula.carga_horaria ?? "") : "";

  const [data, setData] = useState<string>(initialData);
  const [titulo, setTitulo] = useState<string>(initialTitulo);
  const [duracao, setDuracao] = useState<string>(initialDuracao);

  const salvar = useMutation({
    mutationFn: () =>
      upsertAula({
        id: aula?.id,
        turma_id: turmaId,
        data,
        titulo: titulo.trim() || null,
        duracao: duracao.trim() ? Number(duracao) : null,
      }),
    onSuccess: () => {
      toast.success(aula ? "Aula atualizada." : "Aula criada.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeSalvar = data.length >= 8;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{aula ? "Editar aula" : "Nova aula"}</DialogTitle>
        <DialogDescription>
          Registre a data e (opcionalmente) o tema e a duração da aula.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="a-data">Data</Label>
          <Input id="a-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-titulo">Tema (opcional)</Label>
          <Input id="a-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Introdução ao HTML" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-duracao">Duração em minutos (opcional)</Label>
          <Input
            id="a-duracao"
            inputMode="numeric"
            value={duracao}
            onChange={(e) => setDuracao(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="120"
          />
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