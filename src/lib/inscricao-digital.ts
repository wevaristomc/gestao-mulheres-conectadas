import { z } from "zod";

import { isValidCpf, onlyDigits } from "@/lib/cpf";

export const ORIGENS_INSCRICAO = ["formulario", "ocr"] as const;
export const STATUS_INSCRICAO = [
  "pendente",
  "em_revisao",
  "aprovada",
  "rejeitada",
  "duplicada",
] as const;

export type OrigemInscricaoDigital = (typeof ORIGENS_INSCRICAO)[number];
export type StatusInscricaoDigital = (typeof STATUS_INSCRICAO)[number];

export const TURNOS_PREFERIDOS = ["manha", "tarde", "noite", "qualquer"] as const;
export type TurnoPreferido = (typeof TURNOS_PREFERIDOS)[number];

export const TURNO_PREFERIDO_LABEL: Record<TurnoPreferido, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  qualquer: "Qualquer turno",
};

const textoOpcional = z.string().trim().max(300).optional().default("");

export const dadosInscricaoDigitalSchema = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome completo.").max(180),
    cpf: z.string().trim().refine(isValidCpf, "CPF inválido."),
    data_nascimento: textoOpcional,
    genero: textoOpcional,
    raca: textoOpcional,
    pcd: z.boolean().default(false),
    tipo_deficiencia: textoOpcional,
    telefone: z.string().trim().min(8, "Informe um telefone.").max(30),
    email: z.union([z.literal(""), z.string().trim().email("E-mail inválido.")]).default(""),
    endereco: z.string().trim().min(3, "Informe o endereço.").max(300),
    municipio: z.string().trim().min(2, "Informe o município.").max(120),
    bairro_referencia: z
      .string()
      .trim()
      .min(2, "Informe o bairro ou um ponto de referência.")
      .max(180),
    turno_preferido: z
      .string()
      .refine(
        (valor) => TURNOS_PREFERIDOS.includes(valor as TurnoPreferido),
        "Informe o turno de preferência.",
      ),
    nis: textoOpcional,
    beneficiaria_programa_social: z.boolean().default(false),
    qual_programa_social: textoOpcional,
    banco: textoOpcional,
    agencia: textoOpcional,
    conta: textoOpcional,
    observacoes: z.string().trim().max(1000).optional().default(""),
    confiancas: z.record(z.number().min(0).max(1)).optional().default({}),
    motivo_rejeicao: textoOpcional,
    arquivo_nome_original: textoOpcional,
    drive_arquivo_id: textoOpcional,
  })
  .transform((dados) => ({
    ...dados,
    cpf: onlyDigits(dados.cpf),
    tipo_deficiencia: dados.pcd ? dados.tipo_deficiencia : "",
    qual_programa_social: dados.beneficiaria_programa_social ? dados.qual_programa_social : "",
  }));

export type DadosInscricaoDigital = z.input<typeof dadosInscricaoDigitalSchema>;
export type DadosInscricaoDigitalNormalizados = z.output<typeof dadosInscricaoDigitalSchema>;

export const DADOS_INSCRICAO_VAZIOS: DadosInscricaoDigital = {
  nome: "",
  cpf: "",
  data_nascimento: "",
  genero: "",
  raca: "",
  pcd: false,
  tipo_deficiencia: "",
  telefone: "",
  email: "",
  endereco: "",
  municipio: "",
  bairro_referencia: "",
  turno_preferido: "",
  nis: "",
  beneficiaria_programa_social: false,
  qual_programa_social: "",
  banco: "",
  agencia: "",
  conta: "",
  observacoes: "",
  confiancas: {},
  motivo_rejeicao: "",
  arquivo_nome_original: "",
  drive_arquivo_id: "",
};

export type TurmaInscricaoPublica = {
  id: string;
  projetoId: string;
  projetoNome: string;
  nome: string;
  codigo: string | null;
  curso: string | null;
  municipio: string | null;
  turno: string | null;
  localAula: string | null;
  localEndereco: string | null;
  status: string | null;
  vagas: number | null;
  dataInicio: string | null;
};

export type InscricaoDigitalRow = {
  id: string;
  projetoId: string;
  turmaId: string | null;
  turmaNome: string;
  origem: OrigemInscricaoDigital;
  status: StatusInscricaoDigital;
  dados: DadosInscricaoDigitalNormalizados;
  arquivoOrigemPath: string | null;
  arquivoUrl: string | null;
  confiancaOcr: number | null;
  cursistaId: string | null;
  revisadoPor: string | null;
  revisadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  duplicidade: {
    encontrada: boolean;
    cursistaId: string | null;
    nome: string | null;
  };
};

export function campoBaixaConfianca(
  dados: Pick<DadosInscricaoDigitalNormalizados, "confiancas">,
  campo: string,
  limite = 0.7,
): boolean {
  const valor = dados.confiancas?.[campo];
  return typeof valor === "number" && valor < limite;
}
