import { AlertTriangle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCpf, formatPhone, onlyDigits } from "@/lib/cpf";
import {
  campoBaixaConfianca,
  TURNOS_PREFERIDOS,
  TURNO_PREFERIDO_LABEL,
  type DadosInscricaoDigital,
} from "@/lib/inscricao-digital";
import { cn } from "@/lib/utils";

const GENEROS = ["Feminino", "Masculino", "Não-binário", "Prefere não informar"];
const RACAS = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefere não informar"];

type Props = {
  value: DadosInscricaoDigital;
  onChange: (value: DadosInscricaoDigital) => void;
  mostrarConfianca?: boolean;
  disabled?: boolean;
};

export function InscricaoDigitalFields({
  value,
  onChange,
  mostrarConfianca = false,
  disabled = false,
}: Props) {
  const set = <K extends keyof DadosInscricaoDigital>(campo: K, valor: DadosInscricaoDigital[K]) =>
    onChange({ ...value, [campo]: valor });

  const baixa = (campo: string) =>
    mostrarConfianca && campoBaixaConfianca({ confiancas: value.confiancas ?? {} }, campo);

  const Field = ({
    campo,
    label,
    required,
    children,
    className,
  }: {
    campo: string;
    label: string;
    required?: boolean;
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={cn("space-y-1.5", className)}>
      <Label className={cn(baixa(campo) && "text-amber-700")}>
        {label}
        {required ? " *" : ""}
        {baixa(campo) ? (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal">
            <AlertTriangle className="size-3" /> baixa confiança
          </span>
        ) : null}
      </Label>
      <div className={cn(baixa(campo) && "rounded-md ring-2 ring-amber-300")}>{children}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dados pessoais
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field campo="nome" label="Nome completo" required className="md:col-span-2">
            <Input
              value={value.nome}
              onChange={(event) => set("nome", event.target.value)}
              disabled={disabled}
              autoComplete="name"
            />
          </Field>
          <Field campo="cpf" label="CPF" required>
            <Input
              value={value.cpf}
              onChange={(event) => set("cpf", formatCpf(onlyDigits(event.target.value)))}
              disabled={disabled}
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>
          <Field campo="data_nascimento" label="Data de nascimento">
            <Input
              type="date"
              value={value.data_nascimento ?? ""}
              onChange={(event) => set("data_nascimento", event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field campo="genero" label="Gênero">
            <Select
              value={value.genero || undefined}
              onValueChange={(valor) => set("genero", valor)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {GENEROS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field campo="raca" label="Raça/cor">
            <Select
              value={value.raca || undefined}
              onValueChange={(valor) => set("raca", valor)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {RACAS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Contato e endereço
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field campo="telefone" label="Telefone/WhatsApp" required>
            <Input
              value={value.telefone}
              onChange={(event) => set("telefone", formatPhone(event.target.value))}
              disabled={disabled}
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>
          <Field campo="email" label="E-mail">
            <Input
              type="email"
              value={value.email ?? ""}
              onChange={(event) => set("email", event.target.value)}
              disabled={disabled}
              autoComplete="email"
            />
          </Field>
          <Field campo="endereco" label="Endereço completo" required className="md:col-span-2">
            <Input
              value={value.endereco}
              onChange={(event) => set("endereco", event.target.value)}
              disabled={disabled}
              autoComplete="street-address"
            />
          </Field>
          <Field campo="municipio" label="Município" required>
            <Input
              value={value.municipio}
              onChange={(event) => set("municipio", event.target.value)}
              disabled={disabled}
              autoComplete="address-level2"
            />
          </Field>
          <Field campo="bairro_referencia" label="Bairro ou ponto de referência" required>
            <Input
              value={value.bairro_referencia ?? ""}
              onChange={(event) => set("bairro_referencia", event.target.value)}
              disabled={disabled}
              autoComplete="address-level3"
              placeholder="Ex.: Bairro Novo, próximo à praça"
            />
          </Field>
          <Field campo="turno_preferido" label="Turno de preferência" required>
            <Select
              value={value.turno_preferido || undefined}
              onValueChange={(valor) => set("turno_preferido", valor)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o turno" />
              </SelectTrigger>
              <SelectContent>
                {TURNOS_PREFERIDOS.map((turno) => (
                  <SelectItem key={turno} value={turno}>
                    {TURNO_PREFERIDO_LABEL[turno]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field campo="nis" label="NIS">
            <Input
              value={value.nis ?? ""}
              onChange={(event) => set("nis", onlyDigits(event.target.value))}
              disabled={disabled}
              inputMode="numeric"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dados sociais e PCD
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="inscricao-pcd">Pessoa com deficiência (PCD)</Label>
            <Switch
              id="inscricao-pcd"
              checked={value.pcd}
              onCheckedChange={(checked) => set("pcd", checked)}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="inscricao-programa">Beneficiária de programa social</Label>
            <Switch
              id="inscricao-programa"
              checked={value.beneficiaria_programa_social}
              onCheckedChange={(checked) => set("beneficiaria_programa_social", checked)}
              disabled={disabled}
            />
          </div>
          {value.pcd ? (
            <Field campo="tipo_deficiencia" label="Tipo de deficiência">
              <Input
                value={value.tipo_deficiencia ?? ""}
                onChange={(event) => set("tipo_deficiencia", event.target.value)}
                disabled={disabled}
              />
            </Field>
          ) : null}
          {value.beneficiaria_programa_social ? (
            <Field campo="qual_programa_social" label="Qual programa social?">
              <Input
                value={value.qual_programa_social ?? ""}
                onChange={(event) => set("qual_programa_social", event.target.value)}
                disabled={disabled}
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dados bancários e observações
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Field campo="banco" label="Banco">
            <Input
              value={value.banco ?? ""}
              onChange={(e) => set("banco", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field campo="agencia" label="Agência">
            <Input
              value={value.agencia ?? ""}
              onChange={(e) => set("agencia", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field campo="conta" label="Conta">
            <Input
              value={value.conta ?? ""}
              onChange={(e) => set("conta", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field campo="observacoes" label="Observações" className="md:col-span-3">
            <Textarea
              value={value.observacoes ?? ""}
              onChange={(event) => set("observacoes", event.target.value)}
              disabled={disabled}
              rows={3}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}
