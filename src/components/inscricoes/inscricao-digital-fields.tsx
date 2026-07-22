import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
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
  AUTORIZACAO_DADOS_TEXTO,
  campoBaixaConfianca,
  faixaEtariaInscricao,
  idadeReferenciaInscricao,
  municipioDoPoloInscricao,
  POLOS_INSCRICAO,
  RENDAS_FAMILIARES,
  SITUACOES_TRABALHO,
  TAMANHOS_CAMISA,
  TURNOS_PREFERIDOS,
  TURNO_PREFERIDO_LABEL,
  type DadosInscricaoDigital,
} from "@/lib/inscricao-digital";
import { cn } from "@/lib/utils";

const GENEROS = ["Feminino", "Masculino", "Não-binário", "Prefere não informar"];
const RACAS = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefere não informar"];

export const MENSAGEM_INELEGIBILIDADE =
  "Agradecemos muito o seu interesse. Conforme o edital, esta edição do Mulheres Conectadas é destinada exclusivamente a mulheres e, por isso, não conseguimos concluir esta inscrição.";

type FieldProps = {
  campo: string;
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  destacar: boolean;
};

function Field({ campo, label, required, children, className, destacar }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)} data-field={campo}>
      <Label className={cn(destacar && "text-amber-700")}>
        {label}
        {required ? " *" : ""}
        {destacar ? (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal">
            <AlertTriangle className="size-3" /> baixa confiança
          </span>
        ) : null}
      </Label>
      <div className={cn(destacar && "rounded-md ring-2 ring-amber-300")}>{children}</div>
    </div>
  );
}

type Props = {
  value: DadosInscricaoDigital;
  onChange: (value: DadosInscricaoDigital) => void;
  mostrarConfianca?: boolean;
  disabled?: boolean;
  encerrarSeInelegivel?: boolean;
  municipios?: readonly string[];
};

export function InscricaoDigitalFields({
  value,
  onChange,
  mostrarConfianca = false,
  disabled = false,
  encerrarSeInelegivel = false,
  municipios,
}: Props) {
  const set = <K extends keyof DadosInscricaoDigital>(campo: K, valor: DadosInscricaoDigital[K]) =>
    onChange({ ...value, [campo]: valor });
  const baixa = (campo: string) =>
    mostrarConfianca && campoBaixaConfianca({ confiancas: value.confiancas ?? {} }, campo);
  const propsCampo = (campo: string) => ({
    campo,
    destacar: baixa(campo),
  });
  const idadeReferencia = idadeReferenciaInscricao(value);
  const faixaEtaria = faixaEtariaInscricao(value);

  const setPoloPreferido = (polo: string) => {
    const municipio = municipioDoPoloInscricao(polo);
    onChange({ ...value, polo_preferido: polo, municipio: municipio || value.municipio });
  };

  const setContato = (indice: number, campo: "nome" | "telefone" | "parentesco", valor: string) => {
    const contatos = value.contatos_emergencia.map((contato, posicao) =>
      posicao === indice ? { ...contato, [campo]: valor } : contato,
    );
    set("contatos_emergencia", contatos);
  };

  const inelegivel = encerrarSeInelegivel && value.identifica_se_mulher === "nao";

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Elegibilidade e dados pessoais
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            {...propsCampo("identifica_se_mulher")}
            label="Você se identifica como mulher?"
            required
            className="md:col-span-2"
          >
            <Select
              value={value.identifica_se_mulher || undefined}
              onValueChange={(valor) => set("identifica_se_mulher", valor)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {inelegivel ? (
            <div
              role="alert"
              className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950 md:col-span-2"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <p>{MENSAGEM_INELEGIBILIDADE}</p>
            </div>
          ) : null}
          <div className="contents" hidden={inelegivel}>
            <Field {...propsCampo("nome")} label="Nome completo" required className="md:col-span-2">
              <Input
                value={value.nome}
                onChange={(e) => set("nome", e.target.value)}
                disabled={disabled}
                autoComplete="name"
              />
            </Field>
            <Field {...propsCampo("usa_nome_social")} label="Você utiliza nome social?" required>
              <Select
                value={value.usa_nome_social || undefined}
                onValueChange={(valor) =>
                  set("usa_nome_social", valor as DadosInscricaoDigital["usa_nome_social"])
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {value.usa_nome_social === "sim" ? (
              <Field {...propsCampo("nome_social")} label="Nome social" required>
                <Input
                  value={value.nome_social}
                  onChange={(e) => set("nome_social", e.target.value)}
                  disabled={disabled}
                  autoComplete="nickname"
                  placeholder="Nome pelo qual você deseja ser chamada"
                />
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Usaremos este nome no atendimento e na comunicação. O nome completo permanece
                  registrado apenas para conferência documental e matrícula.
                </p>
              </Field>
            ) : null}
            <Field {...propsCampo("cpf")} label="CPF" required>
              <Input
                value={value.cpf}
                onChange={(e) => set("cpf", formatCpf(onlyDigits(e.target.value)))}
                disabled={disabled}
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field {...propsCampo("data_nascimento")} label="Data de nascimento">
              <Input
                type="date"
                value={value.data_nascimento ?? ""}
                onChange={(e) => set("data_nascimento", e.target.value)}
                disabled={disabled}
              />
            </Field>
            <Field {...propsCampo("idade_informada")} label="Idade informada">
              <Input
                value={value.idade_informada ?? ""}
                onChange={(e) => set("idade_informada", onlyDigits(e.target.value).slice(0, 3))}
                disabled={disabled}
                inputMode="numeric"
                placeholder="Ex.: 32"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use quando a ficha ou planilha trouxer idade, mas não trouxer data de nascimento.
              </p>
            </Field>
            <Field {...propsCampo("faixa_etaria")} label="Faixa etária">
              <Input value={faixaEtaria || "Não calculada"} disabled readOnly />
              <p className="mt-1 text-xs text-muted-foreground">
                {idadeReferencia != null
                  ? `Idade de referência: ${idadeReferencia} anos.`
                  : "Informe data de nascimento ou idade para calcular."}
              </p>
            </Field>
            <Field {...propsCampo("genero")} label="Gênero">
              <Select
                value={value.genero || undefined}
                onValueChange={(v) => set("genero", v)}
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
            <Field {...propsCampo("raca")} label="Raça/cor">
              <Select
                value={value.raca || undefined}
                onValueChange={(v) => set("raca", v)}
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
        </div>
      </section>

      <section hidden={inelegivel} className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Contato e endereço
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field {...propsCampo("telefone")} label="Telefone/WhatsApp" required>
            <Input
              value={value.telefone}
              onChange={(e) => set("telefone", formatPhone(e.target.value))}
              disabled={disabled}
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>
          <Field {...propsCampo("email")} label="E-mail">
            <Input
              type="email"
              value={value.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              disabled={disabled}
              autoComplete="email"
            />
          </Field>
          <Field
            {...propsCampo("endereco")}
            label="Endereço completo"
            required
            className="md:col-span-2"
          >
            <Input
              value={value.endereco}
              onChange={(e) => set("endereco", e.target.value)}
              disabled={disabled}
              autoComplete="street-address"
            />
          </Field>
          <Field {...propsCampo("polo_preferido")} label="Polo de preferência" required>
            <Select
              value={value.polo_preferido || undefined}
              onValueChange={setPoloPreferido}
              disabled={disabled}
            >
              <SelectTrigger aria-label="Polo de preferência">
                <SelectValue placeholder="Selecione o polo mais próximo" />
              </SelectTrigger>
              <SelectContent>
                {POLOS_INSCRICAO.map((polo) => (
                  <SelectItem key={polo.nome} value={polo.nome}>
                    {polo.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field {...propsCampo("municipio")} label="Município" required>
            {municipios ? (
              <Select
                value={value.municipio || undefined}
                onValueChange={(municipio) => set("municipio", municipio)}
                disabled={disabled}
              >
                <SelectTrigger aria-label="Município">
                  <SelectValue placeholder="Selecione a cidade" />
                </SelectTrigger>
                <SelectContent>
                  {municipios.map((municipio) => (
                    <SelectItem key={municipio} value={municipio}>
                      {municipio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={value.municipio}
                onChange={(e) => set("municipio", e.target.value)}
                disabled={disabled}
                autoComplete="address-level2"
              />
            )}
          </Field>
          <Field
            {...propsCampo("bairro_referencia")}
            label="Bairro ou ponto de referência"
            required
          >
            <Input
              value={value.bairro_referencia ?? ""}
              onChange={(e) => set("bairro_referencia", e.target.value)}
              disabled={disabled}
              placeholder="Ex.: Bairro Novo, próximo à praça"
            />
          </Field>
          <Field {...propsCampo("turno_preferido")} label="Turno de preferência" required>
            <Select
              value={value.turno_preferido || undefined}
              onValueChange={(v) => set("turno_preferido", v)}
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
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="inscricao-outros-turnos">
              Possui disponibilidade em mais de um turno?
            </Label>
            <Switch
              id="inscricao-outros-turnos"
              checked={value.disponibilidade_outros_turnos}
              onCheckedChange={(v) => set("disponibilidade_outros_turnos", v)}
              disabled={disabled}
            />
          </div>
          <Field {...propsCampo("nis")} label="NIS">
            <Input
              value={value.nis ?? ""}
              onChange={(e) => set("nis", onlyDigits(e.target.value))}
              disabled={disabled}
              inputMode="numeric"
            />
          </Field>
        </div>
      </section>

      <section hidden={inelegivel} className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dados sociais e PCD
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="inscricao-pcd">Pessoa com deficiência (PCD)</Label>
            <Switch
              id="inscricao-pcd"
              checked={value.pcd}
              onCheckedChange={(v) => set("pcd", v)}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="inscricao-programa">Beneficiária de programa social</Label>
            <Switch
              id="inscricao-programa"
              checked={value.beneficiaria_programa_social}
              onCheckedChange={(v) => set("beneficiaria_programa_social", v)}
              disabled={disabled}
            />
          </div>
          {value.pcd ? (
            <Field {...propsCampo("tipo_deficiencia")} label="Tipo de deficiência">
              <Input
                value={value.tipo_deficiencia ?? ""}
                onChange={(e) => set("tipo_deficiencia", e.target.value)}
                disabled={disabled}
              />
            </Field>
          ) : null}
          {value.beneficiaria_programa_social ? (
            <Field {...propsCampo("qual_programa_social")} label="Qual programa social?">
              <Input
                value={value.qual_programa_social ?? ""}
                onChange={(e) => set("qual_programa_social", e.target.value)}
                disabled={disabled}
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section hidden={inelegivel} className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Perfil socioeconômico
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field {...propsCampo("tamanho_camisa")} label="Tamanho da camisa" required>
            <Select
              value={value.tamanho_camisa || undefined}
              onValueChange={(v) => set("tamanho_camisa", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {TAMANHOS_CAMISA.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field {...propsCampo("situacao_trabalho")} label="Situação de trabalho" required>
            <Select
              value={value.situacao_trabalho || undefined}
              onValueChange={(v) => set("situacao_trabalho", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {SITUACOES_TRABALHO.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field {...propsCampo("renda_familiar")} label="Renda familiar" required>
            <Select
              value={value.renda_familiar || undefined}
              onValueChange={(v) => set("renda_familiar", v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {RENDAS_FAMILIARES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            {...propsCampo("motivo_participacao")}
            label="Por que você deseja participar do curso?"
            required
            className="md:col-span-2"
          >
            <Textarea
              value={value.motivo_participacao}
              onChange={(e) => set("motivo_participacao", e.target.value)}
              disabled={disabled}
              rows={4}
            />
          </Field>
        </div>
      </section>

      <section hidden={inelegivel} className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Saúde e emergência
        </h3>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor="inscricao-restricao">Possui restrição alimentar?</Label>
          <Switch
            id="inscricao-restricao"
            checked={value.restricao_alimentar}
            onCheckedChange={(v) => set("restricao_alimentar", v)}
            disabled={disabled}
          />
        </div>
        {value.restricao_alimentar ? (
          <Field
            {...propsCampo("qual_restricao_alimentar")}
            label="Qual restrição alimentar?"
            required
          >
            <Input
              value={value.qual_restricao_alimentar ?? ""}
              onChange={(e) => set("qual_restricao_alimentar", e.target.value)}
              disabled={disabled}
            />
          </Field>
        ) : null}
        {value.contatos_emergencia.map((contato, indice) => (
          <div key={indice} className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">
              Contato de emergência {indice + 1}
              {indice === 0 ? " *" : " (opcional)"}
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field
                {...propsCampo(`contatos_emergencia.${indice}.nome`)}
                label="Nome"
                required={indice === 0}
              >
                <Input
                  value={contato.nome}
                  onChange={(e) => setContato(indice, "nome", e.target.value)}
                  disabled={disabled}
                />
              </Field>
              <Field
                {...propsCampo(`contatos_emergencia.${indice}.telefone`)}
                label="Telefone"
                required={indice === 0}
              >
                <Input
                  value={contato.telefone}
                  onChange={(e) => setContato(indice, "telefone", formatPhone(e.target.value))}
                  disabled={disabled}
                  inputMode="tel"
                />
              </Field>
              <Field
                {...propsCampo(`contatos_emergencia.${indice}.parentesco`)}
                label="Parentesco/relação"
                required={indice === 0}
              >
                <Input
                  value={contato.parentesco}
                  onChange={(e) => setContato(indice, "parentesco", e.target.value)}
                  disabled={disabled}
                />
              </Field>
            </div>
          </div>
        ))}
      </section>

      <section hidden={inelegivel} className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dados bancários e observações
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Field {...propsCampo("banco")} label="Banco">
            <Input
              value={value.banco ?? ""}
              onChange={(e) => set("banco", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field {...propsCampo("agencia")} label="Agência">
            <Input
              value={value.agencia ?? ""}
              onChange={(e) => set("agencia", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field {...propsCampo("conta")} label="Conta">
            <Input
              value={value.conta ?? ""}
              onChange={(e) => set("conta", e.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field {...propsCampo("observacoes")} label="Observações" className="md:col-span-3">
            <Textarea
              value={value.observacoes ?? ""}
              onChange={(e) => set("observacoes", e.target.value)}
              disabled={disabled}
              rows={3}
            />
          </Field>
        </div>
      </section>

      <section hidden={inelegivel} className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Autorização
        </h3>
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4",
            baixa("autorizacao_dados") && "border-amber-400 bg-amber-50",
          )}
        >
          <Checkbox
            id="autorizacao-dados"
            checked={value.autorizacao_dados}
            onCheckedChange={(v) => set("autorizacao_dados", v === true)}
            disabled={disabled}
          />
          <Label htmlFor="autorizacao-dados" className="font-normal leading-relaxed">
            <strong>Sim, autorizo. *</strong> {AUTORIZACAO_DADOS_TEXTO}
          </Label>
        </div>
      </section>
    </div>
  );
}
