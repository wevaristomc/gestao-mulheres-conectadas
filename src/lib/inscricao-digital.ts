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
export const TAMANHOS_CAMISA = ["P", "M", "G", "GG", "XG"] as const;
export const SITUACOES_TRABALHO = [
  "Sim, com carteira assinada",
  "Sim, informal/autônoma",
  "Não estou trabalhando",
] as const;
export const RENDAS_FAMILIARES = [
  "Até 1 salário mínimo",
  "De 1 a 2 salários mínimos",
  "Acima de 2 salários mínimos",
] as const;

export const AUTORIZACAO_DADOS_TEXTO =
  "Você autoriza o Mulheres Conectadas a armazenar, utilizar e compartilhar as informações e os documentos fornecidos neste formulário exclusivamente para fins relacionados ao processo de inscrição, matrícula e comunicação sobre o curso? Ao selecionar Sim, você também autoriza nossa equipe a entrar em contato com você por telefone, WhatsApp, e-mail ou outros meios informados neste formulário para tratar de assuntos relacionados ao Mulheres Conectadas.";

export const TURNO_PREFERIDO_LABEL: Record<TurnoPreferido, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  qualquer: "Qualquer turno",
};

const textoOpcional = z.string().trim().max(300).optional().default("");
const contatoEmergenciaSchema = z.object({
  nome: z.string().trim().max(180).default(""),
  telefone: z.string().trim().max(30).default(""),
  parentesco: z.string().trim().max(100).default(""),
});

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
    identifica_se_mulher: z
      .string()
      .refine(
        (valor) => ["sim", "nao"].includes(valor),
        "Informe se você se identifica como mulher.",
      ),
    disponibilidade_outros_turnos: z.boolean().default(false),
    tamanho_camisa: z
      .string()
      .refine(
        (valor) => TAMANHOS_CAMISA.includes(valor as (typeof TAMANHOS_CAMISA)[number]),
        "Informe o tamanho da camisa.",
      ),
    restricao_alimentar: z.boolean().default(false),
    qual_restricao_alimentar: textoOpcional,
    situacao_trabalho: z
      .string()
      .refine(
        (valor) => SITUACOES_TRABALHO.includes(valor as (typeof SITUACOES_TRABALHO)[number]),
        "Informe sua situação de trabalho.",
      ),
    renda_familiar: z
      .string()
      .refine(
        (valor) => RENDAS_FAMILIARES.includes(valor as (typeof RENDAS_FAMILIARES)[number]),
        "Informe a renda familiar.",
      ),
    motivo_participacao: z
      .string()
      .trim()
      .min(3, "Conte por que você deseja participar do curso.")
      .max(2000),
    contatos_emergencia: z
      .array(contatoEmergenciaSchema)
      .length(2, "Informe os dois espaços de contato de emergência."),
    autorizacao_dados: z
      .boolean()
      .refine((valor) => valor, "Autorize o uso dos dados para enviar a inscrição."),
    autorizacao_dados_em: z.string().trim().max(50).optional().default(""),
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
  .superRefine((dados, contexto) => {
    if (dados.restricao_alimentar && !dados.qual_restricao_alimentar.trim()) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qual_restricao_alimentar"],
        message: "Informe qual é a restrição alimentar.",
      });
    }
    const [primeiro, segundo] = dados.contatos_emergencia;
    if (!primeiro.nome || !primeiro.telefone || !primeiro.parentesco) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contatos_emergencia", 0],
        message: "Preencha nome, telefone e relação do primeiro contato de emergência.",
      });
    }
    const segundoParcial = !!(segundo.nome || segundo.telefone || segundo.parentesco);
    if (segundoParcial && (!segundo.nome || !segundo.telefone || !segundo.parentesco)) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contatos_emergencia", 1],
        message: "Preencha todos os dados do segundo contato ou deixe-o em branco.",
      });
    }
  })
  .transform((dados) => ({
    ...dados,
    cpf: onlyDigits(dados.cpf),
    tipo_deficiencia: dados.pcd ? dados.tipo_deficiencia : "",
    qual_programa_social: dados.beneficiaria_programa_social ? dados.qual_programa_social : "",
    qual_restricao_alimentar: dados.restricao_alimentar ? dados.qual_restricao_alimentar : "",
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
  identifica_se_mulher: "",
  disponibilidade_outros_turnos: false,
  tamanho_camisa: "",
  restricao_alimentar: false,
  qual_restricao_alimentar: "",
  situacao_trabalho: "",
  renda_familiar: "",
  motivo_participacao: "",
  contatos_emergencia: [
    { nome: "", telefone: "", parentesco: "" },
    { nome: "", telefone: "", parentesco: "" },
  ],
  autorizacao_dados: false,
  autorizacao_dados_em: "",
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
  documentoPath: string | null;
  documentoUrl: string | null;
  comprovantePath: string | null;
  comprovanteUrl: string | null;
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
