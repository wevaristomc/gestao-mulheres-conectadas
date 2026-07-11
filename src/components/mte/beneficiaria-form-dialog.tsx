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
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MUNICIPIOS, upsertBeneficiaria, type Beneficiaria } from "@/lib/mte-queries";
import { formatCpf, formatPhone, isValidCpf, onlyDigits } from "@/lib/cpf";
import { HelpPoint } from "@/components/ajuda/help-point";

const GENEROS = ["Feminino", "Masculino", "Não-binário", "Prefere não informar"] as const;
const RACAS = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefere não informar"] as const;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  beneficiaria?: Beneficiaria | null;
};

const empty: Partial<Beneficiaria> = {
  nome: "", cpf: "", data_nascimento: "", genero: "", raca: "",
  pcd: false, tipo_deficiencia: "", telefone: "", email: "", endereco: "",
  municipio: "", nis: "",
  beneficiaria_programa_social: false, qual_programa_social: "",
  banco: "", agencia: "", conta: "",
};

export function BeneficiariaFormDialog({ open, onOpenChange, beneficiaria }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Beneficiaria>>(empty);

  useEffect(() => {
    if (!open) return;
    setForm(beneficiaria ? { ...empty, ...beneficiaria } : empty);
  }, [open, beneficiaria]);

  const set = <K extends keyof Beneficiaria>(k: K, v: Beneficiaria[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const cpfDigits = onlyDigits(form.cpf ?? "");
  const cpfInvalid = cpfDigits.length > 0 && !isValidCpf(cpfDigits);

  const mut = useMutation({
    mutationFn: async () =>
      upsertBeneficiaria({
        id: beneficiaria?.id,
        ...form,
        cpf: cpfDigits,
        telefone: onlyDigits(form.telefone ?? ""),
      }),
    onSuccess: () => {
      toast.success(beneficiaria ? "Beneficiária atualizada" : "Beneficiária cadastrada");
      qc.invalidateQueries({ queryKey: ["mte", "beneficiarias"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar"),
  });

  const canSave =
    (form.nome ?? "").trim().length > 0 &&
    cpfDigits.length === 11 &&
    !cpfInvalid &&
    !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{beneficiaria ? "Editar beneficiária" : "Nova beneficiária"}</DialogTitle>
          <DialogDescription>Dados exigidos pelo Termo de Fomento MTE.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label="Nome completo *" full>
            <Input value={form.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="CPF *" helpId="beneficiaria.cpf">
              <Input
                value={formatCpf(form.cpf ?? "")}
                onChange={(e) => set("cpf", onlyDigits(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                className={cpfInvalid ? "border-destructive" : ""}
              />
              {cpfInvalid ? <p className="text-xs text-destructive">CPF inválido</p> : null}
            </Field>
            <Field label="Data de nascimento">
              <Input type="date" value={form.data_nascimento ?? ""} onChange={(e) => set("data_nascimento", e.target.value)} />
            </Field>
            <Field label="Gênero">
              <Select value={form.genero ?? ""} onValueChange={(v) => set("genero", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {GENEROS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Raça / cor" helpId="beneficiaria.raca">
              <Select value={form.raca ?? ""} onValueChange={(v) => set("raca", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {RACAS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Telefone">
              <Input value={formatPhone(form.telefone ?? "")} onChange={(e) => set("telefone", onlyDigits(e.target.value))} placeholder="(00) 00000-0000" />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Município">
              <Select value={form.municipio ?? ""} onValueChange={(v) => set("municipio", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {MUNICIPIOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="NIS" helpId="beneficiaria.nis">
              <Input value={form.nis ?? ""} onChange={(e) => set("nis", e.target.value)} />
            </Field>
            <Field label="Banco">
              <Input value={form.banco ?? ""} onChange={(e) => set("banco", e.target.value)} placeholder="Ex.: Caixa, Nu, Itaú" />
            </Field>
            <Field label="Agência">
              <Input value={form.agencia ?? ""} onChange={(e) => set("agencia", e.target.value)} />
            </Field>
            <Field label="Conta">
              <Input value={form.conta ?? ""} onChange={(e) => set("conta", e.target.value)} />
            </Field>
          </div>
          <Field label="Endereço" full>
            <Textarea rows={2} value={form.endereco ?? ""} onChange={(e) => set("endereco", e.target.value)} />
          </Field>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label className="text-sm inline-flex items-center gap-1">
                PcD (pessoa com deficiência)
                <HelpPoint id="beneficiaria.pcd" />
              </Label>
              <p className="text-xs text-muted-foreground">Marque se a beneficiária for PcD.</p>
            </div>
            <Switch checked={!!form.pcd} onCheckedChange={(v) => set("pcd", v)} />
          </div>
          {form.pcd ? (
            <Field label="Tipo de deficiência" full>
              <Input value={form.tipo_deficiencia ?? ""} onChange={(e) => set("tipo_deficiencia", e.target.value)} />
            </Field>
          ) : null}

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label className="text-sm inline-flex items-center gap-1">
                Beneficiária de programa social
                <HelpPoint id="beneficiaria.programa_social" />
              </Label>
              <p className="text-xs text-muted-foreground">Ex.: Bolsa Família, BPC.</p>
            </div>
            <Switch
              checked={!!form.beneficiaria_programa_social}
              onCheckedChange={(v) => set("beneficiaria_programa_social", v)}
            />
          </div>
          {form.beneficiaria_programa_social ? (
            <Field label="Qual programa social" full>
              <Input value={form.qual_programa_social ?? ""} onChange={(e) => set("qual_programa_social", e.target.value)} />
            </Field>
          ) : null}
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

function Field({ label, children, full, helpId }: { label: string; children: React.ReactNode; full?: boolean; helpId?: string }) {
  return (
    <div className={`grid gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1">
        {label}
        {helpId ? <HelpPoint id={helpId} /> : null}
      </Label>
      {children}
    </div>
  );
}