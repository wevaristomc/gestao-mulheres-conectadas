import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MatriculaFormDialog } from "@/components/mte/matricula-form-dialog";
import { useHasRole } from "@/hooks/use-active-context";
import { formatCpf } from "@/lib/cpf";
import {
import { useEscopoTurmas } from "@/hooks/use-escopo-turmas";
  turmasMteListOptions, matriculasListOptions, deleteMatricula,
  type Matricula, type Beneficiaria,
} from "@/lib/mte-queries";

export const Route = createFileRoute("/_authenticated/mte/matriculas")({
  component: MatriculasIndex,
});

type Row = Matricula & { beneficiaria?: Beneficiaria | null };

function statusBadge(status: string | null) {
  const s = status ?? "";
  const cls: Record<string, string> = {
    inscrita: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    matriculada: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    cursando: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    concluinte: "bg-green-500/15 text-green-700 dark:text-green-400",
    evadida: "bg-destructive/15 text-destructive",
    desistente: "bg-destructive/15 text-destructive",
  };
  return <Badge variant="secondary" className={`capitalize ${cls[s] ?? ""}`}>{s || "—"}</Badge>;
}

function MatriculasIndex() {
  const qc = useQueryClient();
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "administrativo"]);

  const turmasQ = useQuery(turmasMteListOptions(restrictToUserId));
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>("");
  const effectiveTurma = turmaId || turmas[0]?.id || "";

  const q = useQuery(matriculasListOptions(effectiveTurma || null, restrictToUserId));
  const rows = useMemo(() => (q.data?.rows ?? []) as Row[], [q.data]);

  const counters = useMemo(() => {
    const acc = { inscritas: 0, cursando: 0, concluintes: 0, evadidas: 0 };
    for (const r of rows) {
      const s = r.status ?? "";
      if (s === "inscrita" || s === "matriculada") acc.inscritas += 1;
      if (s === "cursando") acc.cursando += 1;
      if (s === "concluinte") acc.concluintes += 1;
      if (s === "evadida" || s === "desistente") acc.evadidas += 1;
    }
    return acc;
  }, [rows]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteMatricula(id),
    onSuccess: () => {
      toast.success("Matrícula excluída");
      qc.invalidateQueries({ queryKey: ["mte", "matriculas"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  return (
    <div>
      <PageHeader
        helpId="importacao.moodle"
        title="Matrículas"
        description="Vincule beneficiárias a turmas e acompanhe frequência para certificação MTE."
        actions={
          canWrite && effectiveTurma ? (
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Nova matrícula
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid w-full gap-1.5 sm:w-auto">
          <label className="text-xs font-medium text-muted-foreground">Turma</label>
          <Select value={effectiveTurma} onValueChange={setTurmaId}>
            <SelectTrigger className="w-full sm:w-[320px]">
              <SelectValue placeholder={turmas.length ? "Selecione a turma" : "Nenhuma turma cadastrada"} />
            </SelectTrigger>
            <SelectContent>
              {turmas.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {(t.codigo_turma ?? "?")} — {t.nome_curso ?? "—"} ({t.turno ?? "—"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 text-xs sm:ml-auto sm:gap-4">
          <Counter label="Inscritas" value={counters.inscritas} />
          <Counter label="Cursando" value={counters.cursando} />
          <Counter label="Concluintes" value={counters.concluintes} tone="green" />
          <Counter label="Evadidas" value={counters.evadidas} tone="red" />
        </div>
      </div>

      <div className="rounded-md border">
        {/* Mobile cards */}
        <ul className="divide-y md:hidden">
          {!effectiveTurma ? (
            <li className="p-6 text-center text-sm text-muted-foreground">Selecione uma turma.</li>
          ) : q.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="p-3"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-56" /></li>
            ))
          ) : rows.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">Nenhuma matrícula nesta turma.</li>
          ) : rows.map((r) => {
            const freq = r.frequencia_percentual;
            const abaixo = typeof freq === "number" && freq < 75;
            return (
              <li key={r.id} className={`flex min-w-0 items-start justify-between gap-2 p-3 ${abaixo ? "bg-destructive/5" : ""}`}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="break-words text-sm font-semibold">{r.beneficiaria?.nome ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">CPF: {r.beneficiaria?.cpf ? formatCpf(r.beneficiaria.cpf) : "—"}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {statusBadge(r.status)}
                    {typeof freq === "number" ? (
                      <span className={`inline-flex items-center gap-1 font-medium ${abaixo ? "text-destructive" : "text-muted-foreground"}`}>
                        {abaixo ? <AlertTriangle className="h-3 w-3" /> : null}
                        {freq.toFixed(1)}%
                      </span>
                    ) : null}
                    {r.data_inscricao ? <span className="text-muted-foreground">{r.data_inscricao}</span> : null}
                  </div>
                  {r.ficha_inscricao_url ? (
                    <a href={r.ficha_inscricao_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Abrir ficha <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                {canWrite ? (
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => { setEditing(r); setDialogOpen(true); }} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setDeleting(r)} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Beneficiária</TableHead>
              <TableHead className="w-36">CPF</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Inscrição</TableHead>
              <TableHead className="w-32">Frequência</TableHead>
              <TableHead>Ficha</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!effectiveTurma ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Selecione uma turma para ver as matrículas.
                </TableCell>
              </TableRow>
            ) : q.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma matrícula nesta turma.
                </TableCell>
              </TableRow>
            ) : rows.map((r) => {
              const freq = r.frequencia_percentual;
              const abaixo = typeof freq === "number" && freq < 75;
              return (
                <TableRow key={r.id} className={abaixo ? "bg-destructive/5" : undefined}>
                  <TableCell className="font-medium">{r.beneficiaria?.nome ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.beneficiaria?.cpf ? formatCpf(r.beneficiaria.cpf) : "—"}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.data_inscricao ?? "—"}</TableCell>
                  <TableCell>
                    {typeof freq === "number" ? (
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${abaixo ? "text-destructive" : ""}`}>
                        {abaixo ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                        {freq.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.ficha_inscricao_url ? (
                      <a
                        href={r.ficha_inscricao_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Abrir PDF <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">sem ficha</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite ? (
                      <div className="inline-flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleting(r)} title="Excluir">
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
      </div>

      {effectiveTurma ? (
        <MatriculaFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          turmaId={effectiveTurma}
          matricula={editing}
        />
      ) : null}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir matrícula?</AlertDialogTitle>
            <AlertDialogDescription>
              Presenças vinculadas podem ser afetadas. A beneficiária permanece cadastrada.
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

function Counter({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" }) {
  const cls =
    tone === "green"
      ? "text-green-700 dark:text-green-400"
      : tone === "red"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="flex flex-col items-center rounded-md border px-3 py-1">
      <span className={`text-lg font-semibold ${cls}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}