import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useHasRole } from "@/hooks/use-active-context";
import {
  aulasMteListOptions, deleteAulaMTE, turmasMteListOptions, upsertAulaMTE,
  TIPOS_CH, type AulaMTE,
} from "@/lib/mte-queries";
import { DialogGerarListas } from "@/components/pedagogico/dialog-gerar-listas";

export const Route = createFileRoute("/_authenticated/mte/aulas")({
  component: AulasIndex,
});

function AulasIndex() {
  const qc = useQueryClient();
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "administrativo"]);

  const turmasQ = useQuery(turmasMteListOptions());
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>("");
  const effectiveTurma = turmaId || turmas[0]?.id || "";

  const q = useQuery(aulasMteListOptions(effectiveTurma || null));
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);

  const totais = useMemo(() => {
    let prev = 0, min = 0;
    for (const r of rows) {
      prev += Number(r.ch_prevista ?? 0) || 0;
      min += Number(r.ch_ministrada ?? 0) || 0;
    }
    return { prev, min };
  }, [rows]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AulaMTE | null>(null);
  const [deleting, setDeleting] = useState<AulaMTE | null>(null);
  const [gerarOpen, setGerarOpen] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => deleteAulaMTE(id),
    onSuccess: () => {
      toast.success("Aula excluída");
      qc.invalidateQueries({ queryKey: ["mte", "aulas"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  return (
    <div>
      <PageHeader
        title="Aulas — Diário de Classe"
        description="Registro de aulas ministradas por turma (data, conteúdo, carga horária)."
        actions={
          canWrite && effectiveTurma ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setGerarOpen(true)}>
                <ClipboardList className="mr-1 h-4 w-4" /> Gerar listas
              </Button>
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> Nova aula
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Turma</Label>
          <Select value={effectiveTurma} onValueChange={setTurmaId}>
            <SelectTrigger className="w-[320px]">
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
        <div className="ml-auto flex gap-4 text-xs">
          <Counter label="CH prevista" value={`${totais.prev}h`} />
          <Counter label="CH ministrada" value={`${totais.min}h`} tone={totais.min >= totais.prev && totais.prev > 0 ? "green" : undefined} />
          <Counter label="Aulas" value={String(rows.length)} />
        </div>
      </div>

      {q.data?.error ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {q.data.error}
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Data</TableHead>
              <TableHead className="w-32">Horário</TableHead>
              <TableHead className="w-20 text-center">CH prev.</TableHead>
              <TableHead className="w-20 text-center">CH min.</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Conteúdo</TableHead>
              <TableHead>Instrutor(a)</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!effectiveTurma ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Selecione uma turma.</TableCell></TableRow>
            ) : q.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nenhuma aula registrada.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{r.data ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.hora_inicio ?? "—"}{r.hora_fim ? ` – ${r.hora_fim}` : ""}
                </TableCell>
                <TableCell className="text-center">{r.ch_prevista ?? "—"}</TableCell>
                <TableCell className="text-center">{r.ch_ministrada ?? "—"}</TableCell>
                <TableCell>{r.tipo_ch ? <Badge variant="secondary" className="capitalize">{r.tipo_ch}</Badge> : "—"}</TableCell>
                <TableCell className="max-w-md truncate" title={r.conteudo_programatico ?? ""}>{r.conteudo_programatico ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.instrutor ?? "—"}</TableCell>
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
            ))}
          </TableBody>
        </Table>
      </div>

      {effectiveTurma ? (
        <AulaFormDialog open={dialogOpen} onOpenChange={setDialogOpen} turmaId={effectiveTurma} aula={editing} />
      ) : null}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aula?</AlertDialogTitle>
            <AlertDialogDescription>As presenças registradas nesta aula serão removidas.</AlertDialogDescription>
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

function Counter({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  const cls = tone === "green" ? "text-green-700 dark:text-green-400" : "text-foreground";
  return (
    <div className="flex flex-col items-center rounded-md border px-3 py-1">
      <span className={`text-lg font-semibold ${cls}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function AulaFormDialog({
  open, onOpenChange, turmaId, aula,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; turmaId: string; aula?: AulaMTE | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<AulaMTE>>({});

  useEffect(() => {
    if (!open) return;
    setForm(aula ? { ...aula } : {
      data: new Date().toISOString().slice(0, 10),
      hora_inicio: "", hora_fim: "", ch_prevista: 4, ch_ministrada: null,
      tipo_ch: "geral", conteudo_programatico: "", instrutor: "", observacoes: "",
    });
  }, [open, aula]);

  const set = <K extends keyof AulaMTE>(k: K, v: AulaMTE[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => upsertAulaMTE({ id: aula?.id, turma_id: turmaId, ...form }),
    onSuccess: () => {
      toast.success(aula ? "Aula atualizada" : "Aula registrada");
      qc.invalidateQueries({ queryKey: ["mte", "aulas"] });
      qc.invalidateQueries({ queryKey: ["mte", "cronograma"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar"),
  });

  const canSave = !!form.data && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{aula ? "Editar aula" : "Nova aula"}</DialogTitle>
          <DialogDescription>Registro obrigatório para prestação de contas MTE.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={form.data ?? ""} onChange={(e) => set("data", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Tipo de CH</Label>
              <Select value={form.tipo_ch ?? ""} onValueChange={(v) => set("tipo_ch", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_CH.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Hora início</Label>
              <Input type="time" value={form.hora_inicio ?? ""} onChange={(e) => set("hora_inicio", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Hora fim</Label>
              <Input type="time" value={form.hora_fim ?? ""} onChange={(e) => set("hora_fim", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">CH prevista (h)</Label>
              <Input type="number" min={0} step={0.5} value={form.ch_prevista ?? ""} onChange={(e) => set("ch_prevista", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">CH ministrada (h)</Label>
              <Input type="number" min={0} step={0.5} value={form.ch_ministrada ?? ""} onChange={(e) => set("ch_ministrada", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Instrutor(a)</Label>
            <Input value={form.instrutor ?? ""} onChange={(e) => set("instrutor", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Conteúdo programático</Label>
            <Textarea rows={3} value={form.conteudo_programatico ?? ""} onChange={(e) => set("conteudo_programatico", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSave}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}