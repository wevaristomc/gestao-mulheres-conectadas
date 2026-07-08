import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import {
  NOMES_CURSO, TURNOS, MUNICIPIOS, CICLOS,
  faltantesTurma, upsertTurmaMTE, type TurmaMTE,
} from "@/lib/mte-queries";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  turma?: TurmaMTE | null;
  initialValues?: Partial<TurmaMTE> | null;
};

const empty: Partial<TurmaMTE> = {
  executora: "QUINTA ARTE",
  nome_curso: "",
  codigo_turma: "",
  turno: "",
  horario_realizacao: "",
  ch_conhecimentos_gerais: 40,
  ch_conhecimentos_especificos: 110,
  qtd_dias_curso: null,
  dias_semana: "",
  vagas: 50,
  data_inicio: "",
  data_fim: "",
  municipio: "",
  local_endereco: "",
  contato_local_nome: "",
  contato_local_telefone: "",
  ciclo: 1,
  observacoes: "",
};

export function TurmaFormDialog({ open, onOpenChange, turma, initialValues }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<TurmaMTE>>(empty);

  useEffect(() => {
    if (!open) return;
    if (turma) setForm({ ...empty, ...turma });
    else if (initialValues) setForm({ ...empty, ...initialValues });
    else setForm(empty);
  }, [open, turma, initialValues]);

  const set = <K extends keyof TurmaMTE>(k: K, v: TurmaMTE[K] | string | number | null) =>
    setForm((p) => ({ ...p, [k]: v as TurmaMTE[K] }));

  const chG = Number(form.ch_conhecimentos_gerais ?? 0) || 0;
  const chE = Number(form.ch_conhecimentos_especificos ?? 0) || 0;
  const chTotal = chG + chE;
  const missing = faltantesTurma(form);

  const mut = useMutation({
    mutationFn: async () => upsertTurmaMTE({ id: turma?.id, ...form }),
    onSuccess: () => {
      toast.success(turma ? "Turma atualizada" : "Turma criada");
      qc.invalidateQueries({ queryKey: ["mte", "turmas"] });
      qc.invalidateQueries({ queryKey: ["pedagogico", "turmas"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar turma"),
  });

  const canSave = missing.length === 0 && !!form.nome_curso && !!form.codigo_turma && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{turma ? "Editar turma" : "Nova turma"}</DialogTitle>
          <DialogDescription>
            Cronograma oficial MTE — preencha todos os campos exigidos pela fiscalização.
          </DialogDescription>
        </DialogHeader>

        {missing.length > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Campos exigidos pela fiscalização MTE ainda faltando:</div>
              <div className="text-xs opacity-90">{missing.join(" · ")}</div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Executora *">
              <Input value={form.executora ?? ""} onChange={(e) => set("executora", e.target.value)} />
            </Field>
            <Field label="Código da turma *">
              <Input value={form.codigo_turma ?? ""} onChange={(e) => set("codigo_turma", e.target.value)} placeholder="Ex.: T-01" />
            </Field>
            <Field label="Nome do curso *">
              <Select value={form.nome_curso ?? ""} onValueChange={(v) => set("nome_curso", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {NOMES_CURSO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Turno *">
              <Select value={form.turno ?? ""} onValueChange={(v) => set("turno", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Horário de realização *" full>
              <Input value={form.horario_realizacao ?? ""} onChange={(e) => set("horario_realizacao", e.target.value)} placeholder="Ex.: 08:00 às 12:00" />
            </Field>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="CH Conhec. gerais">
              <Input type="number" value={chG} onChange={(e) => set("ch_conhecimentos_gerais", Number(e.target.value))} />
            </Field>
            <Field label="CH Conhec. específicos">
              <Input type="number" value={chE} onChange={(e) => set("ch_conhecimentos_especificos", Number(e.target.value))} />
            </Field>
            <Field label="CH total">
              <Input readOnly value={chTotal} className="bg-muted" />
            </Field>
            <Field label="Qtd. dias do curso">
              <Input type="number" value={form.qtd_dias_curso ?? ""} onChange={(e) => set("qtd_dias_curso", e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Dias da semana">
              <Input value={form.dias_semana ?? ""} onChange={(e) => set("dias_semana", e.target.value)} placeholder="Ex.: Seg, Qua e Sex" />
            </Field>
            <Field label="Vagas">
              <Input type="number" value={form.vagas ?? 50} onChange={(e) => set("vagas", Number(e.target.value))} />
            </Field>
            <Field label="Data de início *">
              <Input type="date" value={form.data_inicio ?? ""} onChange={(e) => set("data_inicio", e.target.value)} />
            </Field>
            <Field label="Data de fim *">
              <Input type="date" value={form.data_fim ?? ""} onChange={(e) => set("data_fim", e.target.value)} />
            </Field>
            <Field label="Município *">
              <Select value={form.municipio ?? ""} onValueChange={(v) => set("municipio", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {MUNICIPIOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ciclo *">
              <Select value={String(form.ciclo ?? 1)} onValueChange={(v) => set("ciclo", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CICLOS.map((c) => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Local / endereço *">
            <Textarea rows={2} value={form.local_endereco ?? ""} onChange={(e) => set("local_endereco", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Contato do local — nome *">
              <Input value={form.contato_local_nome ?? ""} onChange={(e) => set("contato_local_nome", e.target.value)} />
            </Field>
            <Field label="Contato do local — telefone">
              <Input value={form.contato_local_telefone ?? ""} onChange={(e) => set("contato_local_telefone", e.target.value)} />
            </Field>
          </div>

          <Field label="Observações">
            <Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
          </Field>
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`grid gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}