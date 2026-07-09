import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Award, Download, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  baixarCertificado,
  cursistasComStatusOptions,
  emitirCertificado,
  formatarData,
  revogarCertificado,
  turmasDoProjetoOptions,
  type CursistaLinha,
} from "@/lib/administrativo-queries";
import { nomeTurma } from "@/lib/pedagogico-queries";

export const Route = createFileRoute("/_authenticated/administrativo/qualificacao")({
  component: QualificacaoTab,
});

function QualificacaoTab() {
  const { projetoId, projetoNome } = useActiveContext();
  const qc = useQueryClient();
  const turmasQ = useQuery(turmasDoProjetoOptions(projetoId));
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string | null>(null);
  const turmaIdAtiva = turmaId ?? turmas[0]?.id ?? null;
  const turmaAtiva = turmas.find((t) => t.id === turmaIdAtiva) ?? null;
  const turmaNomeAtiva = nomeTurma(turmaAtiva as never);

  const cursistasQ = useQuery(cursistasComStatusOptions(turmaIdAtiva));
  const linhas = cursistasQ.data?.rows ?? [];
  const total = linhas.length;
  const qualificadas = linhas.filter((l) => !!l.qualificado).length;

  const [alvo, setAlvo] = useState<CursistaLinha | null>(null);
  const [obs, setObs] = useState("");
  const [revogarAlvo, setRevogarAlvo] = useState<CursistaLinha | null>(null);

  const emitirMut = useMutation({
    mutationFn: async () => {
      if (!alvo || !turmaIdAtiva) throw new Error("Selecione uma cursista.");
      await emitirCertificado({
        matriculaId: alvo.matriculaId,
        cursistaId: alvo.cursistaId,
        turmaId: turmaIdAtiva,
        projetoId,
        observacoes: obs.trim() || null,
        nome: alvo.nome,
        cpf: alvo.cpf,
        turmaNome: turmaNomeAtiva,
        projetoNome,
      });
    },
    onSuccess: () => {
      toast.success("Certificado emitido com sucesso.");
      qc.invalidateQueries({ queryKey: ["administrativo"] });
      setAlvo(null);
      setObs("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revogarMut = useMutation({
    mutationFn: async (id: string) => revogarCertificado(id),
    onSuccess: (res) => {
      if (res?.warnings?.length) {
        toast.warning(
          `Qualificação revogada, mas houve avisos: ${res.warnings.join("; ")}.`,
        );
      } else {
        toast.success("Qualificação revogada e certificado removido.");
      }
      qc.invalidateQueries({ queryKey: ["administrativo"] });
      setRevogarAlvo(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function abrirCertificado(url: string) {
    try {
      const link = await baixarCertificado(url);
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir certificado.");
    }
  }

  const erro = turmasQ.data?.error ?? cursistasQ.data?.error;

  const turmasOrdenadas = useMemo(
    () =>
      [...turmas].sort((a, b) => {
        const na = nomeTurma(a as never);
        const nb = nomeTurma(b as never);
        return na.localeCompare(nb, "pt-BR");
      }),
    [turmas],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <Label className="text-xs text-muted-foreground">Turma</Label>
          <Select
            value={turmaIdAtiva ?? undefined}
            onValueChange={(v) => setTurmaId(v)}
            disabled={turmasQ.isLoading || turmasOrdenadas.length === 0}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione uma turma" />
            </SelectTrigger>
            <SelectContent>
              {turmasOrdenadas.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {nomeTurma(t as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-3 text-sm">
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Matriculadas</div>
            <div className="text-lg font-semibold">{cursistasQ.isLoading ? "…" : total}</div>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Qualificadas</div>
            <div className="text-lg font-semibold">
              {cursistasQ.isLoading
                ? "…"
                : `${qualificadas}${total ? ` (${Math.round((qualificadas / total) * 100)}%)` : ""}`}
            </div>
          </div>
        </div>
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Não foi possível carregar cursistas</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cursista</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-40">Qualificação</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cursistasQ.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    {turmaIdAtiva
                      ? "Nenhuma cursista matriculada nesta turma."
                      : "Selecione uma turma para visualizar as cursistas."}
                  </TableCell>
                </TableRow>
              ) : (
                linhas.map((l) => (
                  <TableRow key={l.matriculaId}>
                    <TableCell className="font-medium">{l.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{l.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.qualificado ? (
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Award className="h-3.5 w-3.5" />
                            {formatarData(l.qualificado.data_qualificacao)}
                          </span>
                          {l.qualificado.certificado_url ? (
                            <button
                              type="button"
                              onClick={() => abrirCertificado(l.qualificado!.certificado_url!)}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Download className="h-3 w-3" /> Baixar certificado
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Não qualificada</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.qualificado ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={
                            revogarMut.isPending && revogarAlvo?.matriculaId === l.matriculaId
                          }
                          onClick={() => setRevogarAlvo(l)}
                        >
                          {revogarMut.isPending && revogarAlvo?.matriculaId === l.matriculaId ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Undo2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          Revogar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setAlvo(l);
                            setObs("");
                          }}
                        >
                          <Award className="mr-1 h-3.5 w-3.5" /> Emitir certificado
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir certificado — {alvo?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O certificado será gerado em PDF, salvo no armazenamento e ficará disponível
              para download nesta lista e na Base de Conhecimento.
            </p>
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)}>
              Cancelar
            </Button>
            <Button onClick={() => emitirMut.mutate()} disabled={emitirMut.isPending}>
              {emitirMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Award className="mr-1 h-3.5 w-3.5" />
              )}
              Gerar e emitir certificado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!revogarAlvo}
        onOpenChange={(o) => {
          if (!o && !revogarMut.isPending) setRevogarAlvo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar qualificação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá a qualificação de{" "}
              <span className="font-medium text-foreground">{revogarAlvo?.nome}</span>,
              apagará o arquivo do certificado no armazenamento e o registro correspondente
              na Base de Conhecimento. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revogarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={revogarMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (revogarAlvo?.qualificado) revogarMut.mutate(revogarAlvo.qualificado.id);
              }}
            >
              {revogarMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="mr-1 h-3.5 w-3.5" />
              )}
              Revogar qualificação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}