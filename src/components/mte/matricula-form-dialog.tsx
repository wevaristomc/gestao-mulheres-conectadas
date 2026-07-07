import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MATRICULA_STATUS, beneficiariasListOptions, upsertMatricula,
  uploadFichaInscricao, type Matricula, type Beneficiaria,
} from "@/lib/mte-queries";
import { formatCpf } from "@/lib/cpf";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  turmaId: string;
  matricula?: (Matricula & { beneficiaria?: Beneficiaria | null }) | null;
};

export function MatriculaFormDialog({ open, onOpenChange, turmaId, matricula }: Props) {
  const qc = useQueryClient();
  const [beneficiariaId, setBeneficiariaId] = useState<string>("");
  const [status, setStatus] = useState<string>("inscrita");
  const [dataInscricao, setDataInscricao] = useState<string>("");
  const [dataConclusao, setDataConclusao] = useState<string>("");
  const [motivoEvasao, setMotivoEvasao] = useState<string>("");
  const [busca, setBusca] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [assinouLista, setAssinouLista] = useState<boolean>(false);
  const [observacao, setObservacao] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setBeneficiariaId(matricula?.beneficiaria_id ?? "");
    setStatus(matricula?.status ?? "inscrita");
    setDataInscricao(matricula?.data_inscricao ?? new Date().toISOString().slice(0, 10));
    setDataConclusao(matricula?.data_conclusao ?? "");
    setMotivoEvasao(matricula?.motivo_evasao ?? "");
    setBusca("");
    setPendingFile(null);
    setAssinouLista(!!matricula?.assinou_lista);
    setObservacao(matricula?.observacao_importacao ?? "");
  }, [open, matricula]);

  const bq = useQuery(beneficiariasListOptions(busca));
  const beneficiarias = bq.data?.rows ?? [];

  const mut = useMutation({
    mutationFn: async () => {
      const id = await upsertMatricula({
        id: matricula?.id,
        turma_id: turmaId,
        beneficiaria_id: beneficiariaId,
        status,
        data_inscricao: dataInscricao || null,
        data_conclusao: status === "concluinte" ? dataConclusao || null : null,
        motivo_evasao:
          status === "evadida" || status === "desistente" ? motivoEvasao || null : null,
        assinou_lista: assinouLista,
        observacao_importacao: observacao.trim() || null,
      });
      if (pendingFile) await uploadFichaInscricao(id, pendingFile);
      return id;
    },
    onSuccess: () => {
      toast.success(matricula ? "Matrícula atualizada" : "Matrícula criada");
      qc.invalidateQueries({ queryKey: ["mte", "matriculas"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar matrícula"),
  });

  const canSave =
    !!beneficiariaId && !!status &&
    (status !== "concluinte" || !!dataConclusao) &&
    ((status !== "evadida" && status !== "desistente") || motivoEvasao.trim().length > 0) &&
    !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{matricula ? "Editar matrícula" : "Nova matrícula"}</DialogTitle>
          <DialogDescription>Vincule uma beneficiária à turma e informe o status atual.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {!matricula ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">Buscar beneficiária (nome ou CPF)</Label>
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para filtrar…" />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label className="text-xs">Beneficiária *</Label>
            <Select value={beneficiariaId} onValueChange={setBeneficiariaId} disabled={!!matricula}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {beneficiarias.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nome} — {formatCpf(b.cpf)}
                  </SelectItem>
                ))}
                {beneficiarias.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">Nenhuma beneficiária encontrada.</div>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Status *</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATRICULA_STATUS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Data de inscrição</Label>
              <Input type="date" value={dataInscricao} onChange={(e) => setDataInscricao(e.target.value)} />
            </div>
          </div>

          {status === "concluinte" ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">Data de conclusão *</Label>
              <Input type="date" value={dataConclusao} onChange={(e) => setDataConclusao(e.target.value)} />
            </div>
          ) : null}

          {status === "evadida" || status === "desistente" ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">Motivo da evasão / desistência *</Label>
              <Textarea rows={2} value={motivoEvasao} onChange={(e) => setMotivoEvasao(e.target.value)} />
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label className="text-xs">Ficha de inscrição (PDF)</Label>
            {matricula?.ficha_inscricao_url ? (
              <a
                href={matricula.ficha_inscricao_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Ver ficha atual
              </a>
            ) : null}
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
              {pendingFile ? (
                <span className="text-xs text-muted-foreground truncate">
                  <Upload className="inline h-3 w-3" /> {pendingFile.name}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!canSave}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}