import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, HardDrive, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useHasRole } from "@/hooks/use-active-context";
import {
  aulasMteListOptions, deleteEvidencia, evidenciasByTurmaOptions,
  turmasMteListOptions, uploadEvidencia, TIPOS_EVIDENCIA, type Evidencia,
} from "@/lib/mte-queries";
import { GDrivePicker, type GDriveFile } from "@/components/gdrive/gdrive-picker";
import { importGdriveToBucket } from "@/lib/gdrive.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/mte/evidencias")({
  component: EvidenciasIndex,
});

function EvidenciasIndex() {
  const qc = useQueryClient();
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "administrativo", "auxiliar_pedagogico"]);

  const turmasQ = useQuery(turmasMteListOptions());
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>("");
  const effectiveTurma = turmaId || turmas[0]?.id || "";

  const aulasQ = useQuery(aulasMteListOptions(effectiveTurma || null));
  const aulas = aulasQ.data?.rows ?? [];

  const q = useQuery(evidenciasByTurmaOptions(effectiveTurma || null));
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);

  const [tipo, setTipo] = useState<string>("foto_aula");
  const [aulaVinc, setAulaVinc] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [deleting, setDeleting] = useState<Evidencia | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const importGdrive = useServerFn(importGdriveToBucket);

  const up = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo.");
      await uploadEvidencia({
        turma_id: effectiveTurma,
        aula_id: aulaVinc || null,
        tipo,
        descricao: descricao || null,
        file,
      });
    },
    onSuccess: () => {
      toast.success("Evidência enviada");
      setFile(null); setDescricao(""); setAulaVinc("");
      qc.invalidateQueries({ queryKey: ["mte", "evidencias"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao enviar"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteEvidencia(id),
    onSuccess: () => {
      toast.success("Evidência removida");
      qc.invalidateQueries({ queryKey: ["mte", "evidencias"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  const importFromDrive = useMutation({
    mutationFn: async (picked: GDriveFile[]) => {
      for (const f of picked) {
        const res = await importGdrive({
          data: {
            fileId: f.id,
            bucket: "evidencias",
            pathPrefix: `turmas/${effectiveTurma}/evidencias`,
          },
        });
        const payload = {
          turma_id: effectiveTurma,
          aula_id: aulaVinc || null,
          tipo,
          descricao: descricao || `Importado do Drive: ${f.name}`,
          arquivo_url: res.arquivo_url,
          arquivo_nome: res.nome_arquivo,
        };
        const { error } = await supabase.from("evidencias").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Evidência(s) importada(s) do Drive");
      setPickerOpen(false);
      qc.invalidateQueries({ queryKey: ["mte", "evidencias"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao importar do Drive"),
  });

  return (
    <div>
      <PageHeader
        title="Evidências"
        description="Fotos, listas de presença, materiais didáticos e demais comprovantes exigidos pelo MTE."
      />

      <div className="mb-4 grid gap-1.5 md:max-w-md">
        <Label className="text-xs">Turma</Label>
        <Select value={effectiveTurma} onValueChange={setTurmaId}>
          <SelectTrigger>
            <SelectValue placeholder={turmas.length ? "Selecione a turma" : "Nenhuma turma cadastrada"} />
          </SelectTrigger>
          <SelectContent>
            {turmas.map((t) => (
              <SelectItem key={t.id} value={t.id}>{(t.codigo_turma ?? "?")} — {t.nome_curso ?? "—"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canWrite && effectiveTurma ? (
        <div className="mb-6 rounded-md border p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1.5">
              <Label className="text-xs">Tipo *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_EVIDENCIA.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Aula vinculada (opcional)</Label>
              <Select value={aulaVinc || "__none__"} onValueChange={(v) => setAulaVinc(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— nenhuma —</SelectItem>
                  {aulas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.data ?? "s/ data"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Contexto / observações" />
            </div>
            <div className="grid gap-1.5 md:col-span-3">
              <Label className="text-xs">Arquivo *</Label>
              <div className="flex gap-2">
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  title="Escolher do Google Drive do Projeto"
                >
                  <HardDrive className="mr-1.5 h-4 w-4" /> Do Drive
                </Button>
              </div>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => up.mutate()} disabled={!file || up.isPending}>
                {up.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead className="w-40">Enviado em</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!effectiveTurma ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Selecione uma turma.</TableCell></TableRow>
            ) : q.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhuma evidência enviada para esta turma.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Badge variant="secondary" className="capitalize">{r.tipo.replace(/_/g, " ")}</Badge></TableCell>
                <TableCell className="max-w-md truncate" title={r.descricao ?? ""}>{r.descricao ?? "—"}</TableCell>
                <TableCell>
                  <a href={r.arquivo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    {r.arquivo_nome ?? "abrir"} <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite ? (
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(r)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evidência?</AlertDialogTitle>
            <AlertDialogDescription>O registro será removido do histórico da turma.</AlertDialogDescription>
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

      <GDrivePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multi
        title="Escolher evidências do Drive"
        description="Selecione um ou mais arquivos. Serão importados para o bucket de evidências e vinculados à turma."
        onPick={(files) => importFromDrive.mutate(files)}
      />
    </div>
  );
}