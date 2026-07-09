import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, FileCheck2, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  abrirEvidencia,
  evidenciasByAulaOptions,
  evidenciaTemPmq,
  excluirEvidenciaAula,
  formatarData,
  TIPOS_COMPROVACAO_AULA,
  uploadEvidenciasAula,
  type EvidenciaAula,
} from "@/lib/pedagogico-queries";

export type AulaComprovacaoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmaId: string;
  aulaId: string;
  codigoTurma: string | null;
  dataAula: string | null;
};

export function AulaComprovacaoDialog({
  open, onOpenChange, turmaId, aulaId, codigoTurma, dataAula,
}: AulaComprovacaoDialogProps) {
  const qc = useQueryClient();
  const q = useQuery({ ...evidenciasByAulaOptions(aulaId), enabled: open && !!aulaId });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);

  const [tipo, setTipo] = useState<"lista_presenca" | "registro_fotografico">("lista_presenca");
  const [pmq, setPmq] = useState<boolean>(true);
  const [files, setFiles] = useState<File[]>([]);

  const enviar = useMutation({
    mutationFn: async () => {
      if (!files.length) throw new Error("Selecione ao menos um arquivo.");
      return uploadEvidenciasAula({
        turma_id: turmaId,
        aula_id: aulaId,
        codigo_turma: codigoTurma,
        data_aula: dataAula,
        tipo,
        contem_pmq: pmq,
        files,
      });
    },
    onSuccess: (r) => {
      toast.success(`${r.inserted} arquivo(s) anexado(s).`);
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["pedagogico", "evidencias-aula", aulaId] });
      qc.invalidateQueries({ queryKey: ["pedagogico", "evidencias-count-turma", turmaId] });
      qc.invalidateQueries({ queryKey: ["mte", "evidencias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: (ev: EvidenciaAula) => excluirEvidenciaAula(ev),
    onSuccess: () => {
      toast.success("Evidência removida.");
      qc.invalidateQueries({ queryKey: ["pedagogico", "evidencias-aula", aulaId] });
      qc.invalidateQueries({ queryKey: ["pedagogico", "evidencias-count-turma", turmaId] });
      qc.invalidateQueries({ queryKey: ["mte", "evidencias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function abrir(ev: EvidenciaAula, download: boolean) {
    try {
      const url = await abrirEvidencia(ev);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      if (download) a.download = ev.arquivo_nome ?? "evidencia";
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Comprovação da aula · {formatarData(dataAula)}</DialogTitle>
          <DialogDescription>
            Anexe a lista de presença assinada e demais registros. Aceita PDF, JPG ou PNG (máx. 10 MB cada).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_COMPROVACAO_AULA.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <Checkbox
                id="chk-pmq"
                checked={pmq}
                onCheckedChange={(v) => setPmq(v === true)}
              />
              <Label htmlFor="chk-pmq" className="text-xs">
                Contém identificação PMQ (logotipos / cabeçalho oficial visíveis)
              </Label>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Arquivo(s) — PDF, JPG ou PNG</Label>
            <Input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length ? (
              <div className="text-[11px] text-muted-foreground">
                {files.length} arquivo(s) selecionado(s): {files.map((f) => f.name).join(", ")}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => enviar.mutate()} disabled={!files.length || enviar.isPending}>
              {enviar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Enviar
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Tipo</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead className="w-24 text-center">PMQ</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow><TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">Nenhum anexo ainda para esta aula.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {r.tipo.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-mono truncate max-w-[280px]" title={r.arquivo_nome ?? ""}>
                      {r.arquivo_nome ?? "arquivo"}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {evidenciaTemPmq(r.descricao) ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Visualizar" onClick={() => abrir(r, false)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Baixar" onClick={() => abrir(r, true)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Excluir"
                        disabled={excluir.isPending}
                        onClick={() => {
                          if (window.confirm(`Excluir "${r.arquivo_nome ?? "evidência"}"?`)) {
                            excluir.mutate(r);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <div className="flex-1 text-xs text-muted-foreground">
            <FileCheck2 className="inline h-3.5 w-3.5 mr-1" />
            {rows.filter((r) => r.tipo === "lista_presenca").length > 0
              ? "Aula comprovada com lista de presença."
              : "Aula ainda sem lista de presença anexada."}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}