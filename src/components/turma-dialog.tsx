import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { upsertTurma, pickFirst, type Row } from "@/lib/pedagogico-queries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  turma?: Row | null;
};

const TURNOS = ["manha", "tarde", "noite", "integral"] as const;

export function TurmaDialog({ open, onOpenChange, projetoId, turma }: Props) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [turno, setTurno] = useState<string>("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (!open) return;
    setNome(pickFirst(turma ?? undefined, ["nome", "titulo"]) ?? "");
    setTurno((pickFirst(turma ?? undefined, ["turno", "periodo"]) ?? "").toLowerCase());
    setDataInicio((pickFirst(turma ?? undefined, ["data_inicio", "inicio"]) ?? "").slice(0, 10));
    setDataFim((pickFirst(turma ?? undefined, ["data_fim", "fim"]) ?? "").slice(0, 10));
    setDescricao(pickFirst(turma ?? undefined, ["descricao"]) ?? "");
  }, [open, turma]);

  const mut = useMutation({
    mutationFn: async () => {
      await upsertTurma({
        id: turma?.id,
        projeto_id: projetoId,
        nome: nome.trim(),
        turno: turno || null,
        data_inicio: dataInicio || null,
        data_fim: dataFim || null,
        descricao: descricao.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(turma ? "Turma atualizada" : "Turma criada");
      qc.invalidateQueries({ queryKey: ["pedagogico", "turmas"] });
      qc.invalidateQueries({ queryKey: ["administrativo", "turmas"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar turma"),
  });

  const canSave = nome.trim().length > 0 && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{turma ? "Editar turma" : "Nova turma"}</DialogTitle>
          <DialogDescription>
            Preencha os dados da turma. O nome é obrigatório.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Turma A - Manhã" />
          </div>
          <div className="grid gap-1.5">
            <Label>Turno</Label>
            <Select value={turno || "none"} onValueChange={(v) => setTurno(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {TURNOS.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ini">Início</Label>
              <Input id="ini" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fim">Fim</Label>
              <Input id="fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="desc">Descrição</Label>
            <Textarea id="desc" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
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