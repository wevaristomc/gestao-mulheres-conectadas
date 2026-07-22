/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { formatCpf, isValidCpf, onlyDigits } from "@/lib/cpf";
import {
  DADOS_INSCRICAO_VAZIOS,
  dadosInscricaoDigitalSchema,
  faixaEtariaInscricao,
  idadeReferenciaInscricao,
  normalizarIdadeInformada,
  type DadosInscricaoDigitalNormalizados,
  type InscricaoDigitalRow,
  type OrigemInscricaoDigital,
  type StatusInscricaoDigital,
  type TurmaInscricaoPublica,
} from "@/lib/inscricao-digital";
import { PAPEIS_COORDENACAO, requirePapel } from "@/lib/rbac-guard";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { codigoTurma, rotuloTurma } from "@/lib/turmas";

const PAPEIS_LEITURA = [...PAPEIS_COORDENACAO, "professor"] as const;
const UUID = z.string().uuid();
const PROJETO_PADRAO_ID = "d91d2e5a-3d0b-4539-915c-5db6c95dd302";

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function booleano(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return /^(true|sim|s|1)$/i.test(texto(value));
}

function turnoPreferido(value: unknown): string {
  const normalizado = texto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (["manha", "tarde", "noite", "qualquer"].includes(normalizado)) return normalizado;
  return "";
}

function escolhaPermitida(value: unknown, permitidos: readonly string[]): string {
  const candidato = texto(value);
  return permitidos.includes(candidato) ? candidato : "";
}

function contatosEmergencia(value: unknown): Array<{
  nome: string;
  telefone: string;
  parentesco: string;
}> {
  const contatos = Array.isArray(value) ? value : [];
  return [0, 1].map((indice) => {
    const contato =
      contatos[indice] && typeof contatos[indice] === "object"
        ? (contatos[indice] as Record<string, unknown>)
        : {};
    return {
      nome: texto(contato.nome),
      telefone: texto(contato.telefone),
      parentesco: texto(contato.parentesco),
    };
  });
}

function numeroConfianca(value: unknown): number | null {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return null;
  return Math.max(0, Math.min(1, numero > 1 ? numero / 100 : numero));
}

function parseJsonFlexivel(raw: string): Record<string, unknown> {
  const limpo = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(limpo) as Record<string, unknown>;
  } catch {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) {
      return JSON.parse(limpo.slice(inicio, fim + 1)) as Record<string, unknown>;
    }
    throw new Error("A IA não retornou um JSON válido para a ficha.");
  }
}

function normalizarDadosOcr(
  valor: unknown,
  confiancasValor: unknown,
): DadosInscricaoDigitalNormalizados {
  const fonte = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const confiancasFonte =
    confiancasValor && typeof confiancasValor === "object"
      ? (confiancasValor as Record<string, unknown>)
      : {};
  const confiancas: Record<string, number> = {};
  for (const [campo, confianca] of Object.entries(confiancasFonte)) {
    const numero = numeroConfianca(confianca);
    if (numero != null) confiancas[campo] = numero;
  }
  const nomeSocial = texto(fonte.nome_social);
  const usaNomeSocial = (escolhaPermitida(fonte.usa_nome_social, ["sim", "nao"]) ||
    (nomeSocial ? "sim" : "nao")) as "sim" | "nao";
  return {
    ...DADOS_INSCRICAO_VAZIOS,
    nome: texto(fonte.nome),
    usa_nome_social: usaNomeSocial,
    nome_social: usaNomeSocial === "sim" ? nomeSocial : "",
    cpf: onlyDigits(texto(fonte.cpf)),
    data_nascimento: texto(fonte.data_nascimento),
    idade_informada: normalizarIdadeInformada(fonte.idade_informada),
    faixa_etaria: faixaEtariaInscricao({
      data_nascimento: texto(fonte.data_nascimento),
      idade_informada: normalizarIdadeInformada(fonte.idade_informada),
      faixa_etaria: texto(fonte.faixa_etaria),
    }),
    genero: texto(fonte.genero),
    raca: texto(fonte.raca),
    pcd: booleano(fonte.pcd),
    tipo_deficiencia: texto(fonte.tipo_deficiencia),
    telefone: texto(fonte.telefone),
    email: texto(fonte.email),
    endereco: texto(fonte.endereco),
    municipio: texto(fonte.municipio),
    polo_preferido: texto(fonte.polo_preferido),
    bairro_referencia: texto(fonte.bairro_referencia),
    turno_preferido: turnoPreferido(fonte.turno_preferido),
    identifica_se_mulher: escolhaPermitida(fonte.identifica_se_mulher, ["sim", "nao"]),
    disponibilidade_outros_turnos: booleano(fonte.disponibilidade_outros_turnos),
    tamanho_camisa: escolhaPermitida(fonte.tamanho_camisa, ["P", "M", "G", "GG", "XG"]),
    restricao_alimentar: booleano(fonte.restricao_alimentar),
    qual_restricao_alimentar: texto(fonte.qual_restricao_alimentar),
    situacao_trabalho: escolhaPermitida(fonte.situacao_trabalho, [
      "Sim, com carteira assinada",
      "Sim, informal/autônoma",
      "Não estou trabalhando",
    ]),
    renda_familiar: escolhaPermitida(fonte.renda_familiar, [
      "Até 1 salário mínimo",
      "De 1 a 2 salários mínimos",
      "Acima de 2 salários mínimos",
    ]),
    motivo_participacao: texto(fonte.motivo_participacao),
    contatos_emergencia: contatosEmergencia(fonte.contatos_emergencia),
    autorizacao_dados: booleano(fonte.autorizacao_dados),
    autorizacao_dados_em: texto(fonte.autorizacao_dados_em),
    nis: texto(fonte.nis),
    beneficiaria_programa_social: booleano(fonte.beneficiaria_programa_social),
    qual_programa_social: texto(fonte.qual_programa_social),
    banco: texto(fonte.banco),
    agencia: texto(fonte.agencia),
    conta: texto(fonte.conta),
    observacoes: texto(fonte.observacoes),
    confiancas,
    motivo_rejeicao: "",
    arquivo_nome_original: "",
    drive_arquivo_id: "",
  };
}

function bytesDeBase64(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function base64DeBytes(bytes: Uint8Array): string {
  let binario = "";
  const tamanho = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanho) {
    binario += String.fromCharCode(...bytes.subarray(i, Math.min(i + tamanho, bytes.length)));
  }
  return btoa(binario);
}

async function imagemParaPdf(base64: string, mime: string): Promise<string> {
  if (!/^image\/(png|jpe?g)$/i.test(mime)) {
    throw new Error(
      "Para fotos, use PNG ou JPG. Outros formatos devem ser convertidos antes do envio.",
    );
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const propriedades = doc.getImageProperties(`data:${mime};base64,${base64}`);
  const escala = Math.min(
    (larguraPagina - 48) / propriedades.width,
    (alturaPagina - 48) / propriedades.height,
  );
  const largura = propriedades.width * escala;
  const altura = propriedades.height * escala;
  doc.addImage(
    `data:${mime};base64,${base64}`,
    mime.toLowerCase().includes("png") ? "PNG" : "JPEG",
    (larguraPagina - largura) / 2,
    (alturaPagina - altura) / 2,
    largura,
    altura,
  );
  return base64DeBytes(new Uint8Array(doc.output("arraybuffer")));
}

const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;

async function anexoEmPdf(base64: string, mime: string): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = bytesDeBase64(base64);
  } catch {
    throw new Error("O anexo enviado está corrompido ou não pôde ser lido.");
  }
  if (bytes.byteLength > TAMANHO_MAXIMO_ANEXO) {
    throw new Error("Cada anexo deve ter no máximo 10 MB.");
  }
  const mimeNormalizado = mime.toLowerCase();
  const assinaturaValida =
    (mimeNormalizado === "application/pdf" &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46) ||
    (mimeNormalizado === "image/png" &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47) ||
    (mimeNormalizado === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8);
  if (!assinaturaValida) {
    throw new Error("O conteúdo do anexo não corresponde ao formato PDF, JPG ou PNG informado.");
  }
  if (mime.toLowerCase() === "application/pdf") return bytes;
  return bytesDeBase64(await imagemParaPdf(base64, mime));
}

async function urlArquivo(admin: any, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("evidencias:")) {
    const storagePath = path.slice("evidencias:".length);
    const { data } = await admin.storage.from("evidencias").createSignedUrl(storagePath, 60 * 60);
    return data?.signedUrl ?? null;
  }
  if (path.startsWith("drive:")) {
    return `https://drive.google.com/file/d/${encodeURIComponent(path.slice(6))}/preview`;
  }
  return path;
}

export const listarTurmasInscricaoPublica = createServerFn({ method: "GET" }).handler(
  async (): Promise<TurmaInscricaoPublica[]> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data, error } = await admin
      .from("turmas")
      .select(
        "id, projeto_id, codigo, curso, nome_curso, codigo_turma, municipio, turno, local_aula, local_endereco, data_inicio, status, vagas, projetos(nome)",
      )
      .order("data_inicio", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Não foi possível carregar as turmas: ${error.message}`);
    return ((data ?? []) as any[]).map((turma) => ({
      id: turma.id,
      projetoId: turma.projeto_id,
      projetoNome: turma.projetos?.nome ?? "Mulheres Conectadas",
      nome: rotuloTurma(turma),
      codigo: codigoTurma(turma),
      curso: turma.nome_curso ?? turma.curso ?? null,
      municipio: turma.municipio ?? null,
      turno: turma.turno ?? null,
      localAula: turma.local_aula ?? null,
      localEndereco: turma.local_endereco ?? null,
      status: turma.status ?? null,
      vagas: turma.vagas == null ? null : Number(turma.vagas),
      dataInicio: turma.data_inicio ?? null,
    }));
  },
);

const AnexoPublicoSchema = z.object({
  nome: z.string().trim().min(1).max(240),
  mime: z.string().regex(/^(application\/pdf|image\/(png|jpe?g))$/i),
  base64: z.string().min(20).max(15_000_000),
});

export const criarInscricaoFormulario = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        dados: dadosInscricaoDigitalSchema,
        aceiteFisico: z.literal(true),
        website: z.string().max(0).optional().default(""),
        documento: AnexoPublicoSchema,
        comprovante: AnexoPublicoSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.dados.identifica_se_mulher !== "sim") {
      throw new Error(
        "Agradecemos muito o seu interesse. Conforme o edital, esta edição do Mulheres Conectadas é destinada exclusivamente a mulheres e, por isso, não conseguimos concluir esta inscrição.",
      );
    }
    if (!data.dados.autorizacao_dados) {
      throw new Error("Autorize o uso dos dados para enviar a inscrição.");
    }

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    let { data: projeto, error: projetoError } = await admin
      .from("projetos")
      .select("id")
      .eq("id", PROJETO_PADRAO_ID)
      .maybeSingle();
    if (projetoError) {
      throw new Error(`Não foi possível localizar o projeto padrão: ${projetoError.message}`);
    }
    if (!projeto) {
      const resultado = await admin.from("projetos").select("id").limit(1).maybeSingle();
      projeto = resultado.data;
      projetoError = resultado.error;
    }
    if (projetoError || !projeto) throw new Error("O projeto padrão não está disponível.");

    const inscricaoId = crypto.randomUUID();
    const documentoStoragePath = `inscricoes/${inscricaoId}/documento.pdf`;
    const comprovanteStoragePath = data.comprovante
      ? `inscricoes/${inscricaoId}/comprovante.pdf`
      : null;
    const enviados: string[] = [];

    try {
      const documentoBytes = await anexoEmPdf(data.documento.base64, data.documento.mime);
      const { error: documentoError } = await admin.storage
        .from("evidencias")
        .upload(documentoStoragePath, documentoBytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (documentoError)
        throw new Error(`Falha ao arquivar o documento: ${documentoError.message}`);
      enviados.push(documentoStoragePath);

      if (data.comprovante && comprovanteStoragePath) {
        const comprovanteBytes = await anexoEmPdf(data.comprovante.base64, data.comprovante.mime);
        const { error: comprovanteError } = await admin.storage
          .from("evidencias")
          .upload(comprovanteStoragePath, comprovanteBytes, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (comprovanteError) {
          throw new Error(`Falha ao arquivar o comprovante: ${comprovanteError.message}`);
        }
        enviados.push(comprovanteStoragePath);
      }

      const criadoEm = new Date().toISOString();
      const { data: inscricao, error } = await admin
        .from("inscricoes_digitais")
        .insert({
          id: inscricaoId,
          projeto_id: projeto.id,
          turma_id: null,
          origem: "formulario",
          status: "pendente",
          dados: { ...data.dados, autorizacao_dados_em: criadoEm },
          documento_path: `evidencias:${documentoStoragePath}`,
          comprovante_path: comprovanteStoragePath ? `evidencias:${comprovanteStoragePath}` : null,
        })
        .select("id, criado_em")
        .single();
      if (error) {
        if (
          /inscricoes_digitais|documento_path|comprovante_path|schema cache|does not exist/i.test(
            error.message,
          )
        ) {
          throw new Error(
            "A migração do perfil completo da inscrição ainda não foi aplicada no Supabase.",
          );
        }
        throw new Error(error.message);
      }
      return {
        id: inscricao.id as string,
        criadoEm: inscricao.criado_em as string,
        autorizacaoDadosEm: criadoEm,
      };
    } catch (error) {
      if (enviados.length) await admin.storage.from("evidencias").remove(enviados);
      throw error;
    }
  });

const ProjetoInput = z.object({ projetoId: UUID });

export const listarInscricoesDigitais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel([...PAPEIS_LEITURA])])
  .inputValidator((input: unknown) => ProjetoInput.parse(input))
  .handler(async ({ data }): Promise<InscricaoDigitalRow[]> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("inscricoes_digitais")
      .select(
        "*, turmas(codigo, curso, nome_curso, codigo_turma, turno, municipio, local_aula, local_endereco)",
      )
      .eq("projeto_id", data.projetoId)
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);

    const cpfs = Array.from(
      new Set<string>(
        ((rows ?? []) as any[])
          .map((row: any) => onlyDigits(texto(row.dados?.cpf)))
          .filter((cpf: string) => cpf.length === 11),
      ),
    );
    const formatos = cpfs.flatMap((cpf) => [cpf, formatCpf(cpf)]);
    const [cursistasRes, beneficiariasRes] = await Promise.all([
      formatos.length
        ? admin.from("cursistas").select("id, nome, cpf").in("cpf", formatos)
        : Promise.resolve({ data: [], error: null }),
      formatos.length
        ? admin.from("beneficiarias").select("id, nome, cpf").in("cpf", formatos)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const existentes = [...(cursistasRes.data ?? []), ...(beneficiariasRes.data ?? [])] as any[];
    const porCpf = new Map<string, any>();
    for (const existente of existentes) porCpf.set(onlyDigits(existente.cpf ?? ""), existente);

    return Promise.all(
      ((rows ?? []) as any[]).map(async (row): Promise<InscricaoDigitalRow> => {
        const cpf = onlyDigits(texto(row.dados?.cpf));
        const duplicada = porCpf.get(cpf);
        return {
          id: row.id,
          projetoId: row.projeto_id,
          turmaId: row.turma_id,
          turmaNome:
            row.turmas?.nome_curso ??
            row.turmas?.curso ??
            row.turmas?.codigo_turma ??
            row.turmas?.codigo ??
            "Turma não definida",
          origem: row.origem as OrigemInscricaoDigital,
          status: row.status as StatusInscricaoDigital,
          dados: normalizarDadosOcr(row.dados, row.dados?.confiancas),
          arquivoOrigemPath: row.arquivo_origem_path,
          arquivoUrl: await urlArquivo(admin, row.arquivo_origem_path),
          documentoPath: row.documento_path ?? null,
          documentoUrl: await urlArquivo(admin, row.documento_path),
          comprovantePath: row.comprovante_path ?? null,
          comprovanteUrl: await urlArquivo(admin, row.comprovante_path),
          confiancaOcr: row.confianca_ocr == null ? null : Number(row.confianca_ocr),
          cursistaId: row.cursista_id,
          revisadoPor: row.revisado_por,
          revisadoEm: row.revisado_em,
          criadoEm: row.criado_em,
          atualizadoEm: row.atualizado_em,
          duplicidade: {
            encontrada: !!duplicada,
            cursistaId: duplicada?.id ?? null,
            nome: duplicada?.nome ?? null,
          },
        };
      }),
    );
  });
type ArquivoPlanilhaGoogleForms = {
  nome: string;
  mime?: string;
  base64: string;
};

type StatusLinhaGoogleForms =
  "importar" | "atualizar" | "duplicada" | "nao_elegivel" | "sem_autorizacao" | "erro";

type ResumoPreviewGoogleForms = Record<StatusLinhaGoogleForms, number> & {
  total: number;
  fora_area: number;
  menor_idade: number;
};

export type LinhaPreviewGoogleForms = {
  linha: number;
  nome: string;
  email: string;
  telefone: string;
  idadeInformada: string;
  municipio: string;
  bairroReferencia: string;
  turnoPreferido: string;
  autorizacaoDados: boolean;
  status: StatusLinhaGoogleForms;
  motivo: string;
  foraArea: boolean;
  menorIdade: boolean;
};

export type ResultadoPreviewGoogleForms = {
  resumo: ResumoPreviewGoogleForms;
  linhas: LinhaPreviewGoogleForms[];
};

export type RelatorioInscricoesLinha = {
  municipio: string;
  bairroReferencia: string;
  turnoPreferido: string;
  total: number;
  pendentes: number;
  emRevisao: number;
  aprovadas: number;
  rejeitadas: number;
  duplicadas: number;
  turmas: number;
  vagas: number;
  demandaSemOferta: boolean;
};

export type RelatorioInscricoesRegiao = {
  geradoEm: string;
  total: number;
  pendentes: number;
  porTurno: Record<string, number>;
  porMunicipio: Array<{
    municipio: string;
    total: number;
    pendentes: number;
    porTurno: Record<string, number>;
    turmas: number;
    vagas: number;
  }>;
  linhas: RelatorioInscricoesLinha[];
};

export type DashboardDistribuicaoItem = {
  label: string;
  total: number;
  percentual: number;
};

export type DashboardInscricoesRegiaoItem = DashboardDistribuicaoItem & {
  idadeMedia: number | null;
  naoTrabalhando: number;
  ateUmSalario: number;
  programaSocial: number;
  turnos: Record<string, number>;
  turmas: number;
  vagas: number;
};

export type DashboardInscricoesBairroItem = DashboardDistribuicaoItem & {
  municipio: string;
  bairro: string;
  percentualCidade: number;
  manha: number;
  noite: number;
};

export type DashboardInscricoes = {
  geradoEm: string;
  total: number;
  pendentes: number;
  emRevisao: number;
  aprovadas: number;
  rejeitadas: number;
  duplicadas: number;
  elegiveisPreliminarmente: number;
  cadastrosParaRevisao: number;
  semDocumento: number;
  menoresDe18: number;
  acimaDe60: number;
  foraAreaTurmas: number;
  idadeMedia: number | null;
  idadeMediana: number | null;
  concentracaoPrincipal: {
    municipio: string;
    percentual: number;
  } | null;
  porMunicipio: DashboardInscricoesRegiaoItem[];
  porFaixaEtaria: Array<
    DashboardDistribuicaoItem & {
      naoTrabalhando: number;
      ateUmSalario: number;
      programaSocial: number;
      manha: number;
      noite: number;
    }
  >;
  porTrabalho: DashboardDistribuicaoItem[];
  porRenda: DashboardDistribuicaoItem[];
  porTurno: DashboardDistribuicaoItem[];
  porCamisa: DashboardDistribuicaoItem[];
  porProgramaSocial: DashboardDistribuicaoItem[];
  porDisponibilidadeTurnos: DashboardDistribuicaoItem[];
  porRestricaoAlimentar: DashboardDistribuicaoItem[];
  porDeficiencia: DashboardDistribuicaoItem[];
  porOrigem: DashboardDistribuicaoItem[];
  porStatus: DashboardDistribuicaoItem[];
  porBairro: DashboardInscricoesBairroItem[];
  pendencias: DashboardDistribuicaoItem[];
};

const ArquivoGoogleFormsSchema = z.object({
  nome: z.string().trim().min(1).max(240),
  mime: z.string().optional().default(""),
  base64: z.string().min(8).max(30_000_000),
});

function normalizarTextoComparacao(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizarHeader(valor: unknown): string {
  return normalizarTextoComparacao(String(valor ?? ""))
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(textoCsv: string): string[][] {
  const textoLimpo = textoCsv.replace(/^\uFEFF/, "");
  const primeiraLinha = textoLimpo.split("\n")[0] ?? "";
  const delimitador =
    (primeiraLinha.match(/;/g)?.length ?? 0) > (primeiraLinha.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let atual = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < textoLimpo.length; i += 1) {
    const ch = textoLimpo[i];
    const prox = textoLimpo[i + 1];
    if (ch === '"') {
      if (aspas && prox === '"') {
        atual += '"';
        i += 1;
      } else {
        aspas = !aspas;
      }
    } else if (ch === delimitador && !aspas) {
      linha.push(atual.trim());
      atual = "";
    } else if ((ch === "\n" || ch === "\r") && !aspas) {
      if (ch === "\r" && prox === "\n") i += 1;
      linha.push(atual.trim());
      if (linha.some((celula) => celula.length > 0)) linhas.push(linha);
      linha = [];
      atual = "";
    } else {
      atual += ch;
    }
  }
  linha.push(atual.trim());
  if (linha.some((celula) => celula.length > 0)) linhas.push(linha);
  return linhas;
}

function bytesParaTextoUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function lerPlanilhaGoogleForms(
  arquivo: ArquivoPlanilhaGoogleForms,
): Promise<Record<string, string>[]> {
  const bytes = bytesDeBase64(arquivo.base64);
  const nome = arquivo.nome.toLowerCase();
  let matriz: unknown[][];
  if (/\.xlsx?$/.test(nome) || /spreadsheet|excel/i.test(arquivo.mime ?? "")) {
    const XLSX: any = await import("xlsx");
    const wb = XLSX.read(bytes, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    matriz = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
  } else {
    matriz = parseCsv(bytesParaTextoUtf8(bytes));
  }
  const cabecalho = (matriz[0] ?? []).map((v) => String(v ?? "").trim());
  if (!cabecalho.length) throw new Error("A planilha não possui cabeçalho.");
  const indiceColuna18 = cabecalho.findIndex((header) => normalizarHeader(header) === "coluna 18");
  const ultimoIndice = cabecalho.length - 1;
  const valoresUltimaColuna = matriz
    .slice(1)
    .map((linha) => String(linha[ultimoIndice] ?? "").trim())
    .filter(Boolean);
  const ultimaColunaPareceAutorizacao =
    ultimoIndice >= 0 &&
    valoresUltimaColuna.length > 0 &&
    valoresUltimaColuna.every((valor) => ehSimOuNao(valor));
  const indiceAutorizacao =
    indiceColuna18 >= 0 ? indiceColuna18 : ultimaColunaPareceAutorizacao ? ultimoIndice : -1;

  return matriz.slice(1).map((linha) => {
    const row: Record<string, string> = {};
    cabecalho.forEach((header, index) => {
      row[header] = String(linha[index] ?? "").trim();
    });
    if (indiceAutorizacao >= 0) {
      row.__autorizacao_dados_forms = String(linha[indiceAutorizacao] ?? "").trim();
    }
    return row;
  });
}

function valorColuna(row: Record<string, string>, candidatos: string[]): string {
  const entradas = Object.entries(row);
  const normalizados = candidatos.map(normalizarHeader);
  const exato = entradas.find(([header]) => normalizados.includes(normalizarHeader(header)));
  if (exato) return exato[1]?.trim() ?? "";

  const encontrado = entradas.find(([header]) => {
    const h = normalizarHeader(header);
    return normalizados.some((c) => h.includes(c));
  });
  return encontrado?.[1]?.trim() ?? "";
}

function simNao(valor: string): boolean {
  return /^(sim|s|true|1|autorizo|concordo|aceito)/i.test(normalizarTextoComparacao(valor));
}

function ehNao(valor: string): boolean {
  return /^(nao|n|false|0)/i.test(normalizarTextoComparacao(valor));
}

function ehSimOuNao(valor: string): boolean {
  const norm = normalizarTextoComparacao(valor);
  return /^(sim|s|nao|n)$/.test(norm);
}

function valorAutorizacaoForms(row: Record<string, string>): string {
  return (
    valorColuna(row, ["autorizacao para uso dos dados", "autoriza", "uso dos dados", "lgpd"]) ||
    row.__autorizacao_dados_forms ||
    ""
  );
}

function distanciaEdicao(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + custo);
    }
  }
  return dp[a.length][b.length];
}

function normalizarMunicipioForms(valor: string, municipiosOficiais: string[]): string {
  const bruto = valor.trim();
  const norm = normalizarTextoComparacao(bruto)
    .replace(/\bmg\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return "";

  const oficial = municipiosOficiais.find(
    (municipio) => normalizarTextoComparacao(municipio) === norm,
  );
  if (oficial) return oficial;

  const semPontuacao = norm
    .replace(/[-_/,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const primeiroTrecho =
    semPontuacao.split(/\s+(?:e|ou)\s+|\s*\/\s*|\s*-\s*|\s*,\s*/)[0]?.trim() ?? semPontuacao;

  if (semPontuacao.includes("betim") || primeiroTrecho === "betim") return "Betim";
  if (["bh", "b h", "belo horizonte"].includes(semPontuacao)) return "Belo Horizonte";
  if (semPontuacao.includes("belo horizonte")) return "Belo Horizonte";
  if (semPontuacao.includes("juatuba")) return "Juatuba";
  if (semPontuacao.includes("ibirite") || semPontuacao.includes("ibirité")) return "Ibirité";

  const candidatos = ["Betim", "Belo Horizonte", "Juatuba", "Ibirité"];
  const comparavel = primeiroTrecho || semPontuacao;
  const aproximado = candidatos.find(
    (cidade) => distanciaEdicao(comparavel, normalizarTextoComparacao(cidade)) <= 2,
  );
  if (aproximado) return aproximado;

  return bruto;
}

function idadeInformadaGoogleForms(observacoes: string): number | null {
  const match = observacoes.match(/Idade informada:\s*(\d{1,3})/i);
  if (!match) return null;
  const idade = Number(match[1]);
  return Number.isFinite(idade) ? idade : null;
}

function adicionarObservacaoGoogleForms(
  dados: DadosInscricaoDigitalNormalizados,
  observacao: string,
) {
  dados.observacoes = [dados.observacoes, observacao].filter(Boolean).join(" ");
}

function normalizarTurnoForms(valor: string): string {
  const norm = normalizarTextoComparacao(valor);
  if (norm.includes("manha")) return "manha";
  if (norm.includes("tarde")) return "tarde";
  if (norm.includes("noite")) return "noite";
  if (norm.includes("qualquer")) return "qualquer";
  return "";
}

function normalizarTrabalho(valor: string): string {
  const norm = normalizarTextoComparacao(valor);
  if (!norm) return "";
  if (norm.includes("carteira") || norm.includes("clt") || norm.includes("assinada"))
    return "Sim, com carteira assinada";
  if (norm.includes("informal") || norm.includes("autonom") || norm.includes("proprio"))
    return "Sim, informal/autônoma";
  if (norm.startsWith("nao") || norm.includes("desempreg") || norm.includes("nao estou"))
    return "Não estou trabalhando";
  return valor.trim();
}

function normalizarRenda(valor: string): string {
  const norm = normalizarTextoComparacao(valor);
  if (!norm) return "";
  if (norm.includes("acima") || norm.includes("mais de 2")) return "Acima de 2 salários mínimos";
  if (norm.includes("1 a 2") || norm.includes("um a dois") || norm.includes("de 1"))
    return "De 1 a 2 salários mínimos";
  if (norm.includes("ate") || norm.includes("1 salario") || norm.includes("um salario"))
    return "Até 1 salário mínimo";
  return valor.trim();
}

function normalizarCamisa(valor: string): string {
  const v = valor.trim().toUpperCase();
  if (["P", "M", "G", "GG", "XG"].includes(v)) return v;
  return "";
}

function partesDataForms(valor: string): {
  dia: number;
  mes: number;
  ano: number;
  hora: number;
  minuto: number;
  segundo: number;
} | null {
  const v = valor.trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const ano = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const hora = Number(m[4] ?? 0);
  const minuto = Number(m[5] ?? 0);
  const segundo = Number(m[6] ?? 0);
  if (
    !Number.isInteger(ano) ||
    !Number.isInteger(mes) ||
    !Number.isInteger(dia) ||
    mes < 1 ||
    mes > 12 ||
    dia < 1 ||
    dia > 31 ||
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59 ||
    segundo < 0 ||
    segundo > 59
  ) {
    return null;
  }
  const data = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return { dia, mes, ano, hora, minuto, segundo };
}

function carimboFormsParaIso(valor: string, fallbackIso: string): string {
  const partes = partesDataForms(valor);
  if (!partes) return fallbackIso;
  return new Date(
    Date.UTC(partes.ano, partes.mes - 1, partes.dia, partes.hora, partes.minuto, partes.segundo),
  ).toISOString();
}

function formatarDataForms(valor: string): string {
  const partes = partesDataForms(valor);
  if (!partes) return valor.trim();
  return (
    String(partes.dia).padStart(2, "0") +
    "/" +
    String(partes.mes).padStart(2, "0") +
    "/" +
    partes.ano +
    (partes.hora || partes.minuto || partes.segundo
      ? ` ${String(partes.hora).padStart(2, "0")}:${String(partes.minuto).padStart(2, "0")}${
          partes.segundo ? `:${String(partes.segundo).padStart(2, "0")}` : ""
        }`
      : "")
  );
}

function dadosGoogleForms(
  row: Record<string, string>,
  municipiosOficiais: string[],
): DadosInscricaoDigitalNormalizados {
  const carimbo = valorColuna(row, ["carimbo de data hora", "timestamp", "data hora"]);
  const importadoEm = new Date().toISOString();
  const autorizacaoDadosEm = carimboFormsParaIso(carimbo, importadoEm);
  const idade = normalizarIdadeInformada(valorColuna(row, ["idade"]));
  const restricaoRaw = valorColuna(row, ["restricao alimentar"]);
  const restricaoQual = valorColuna(row, ["qual restricao", "qual e a restricao", "qual"]);
  const pcdRaw = valorColuna(row, ["possui alguma deficiencia", "deficiencia", "pcd"]);
  const pcdQual = valorColuna(row, ["qual deficiencia", "tipo deficiencia"]);
  const programaRaw = valorColuna(row, ["beneficiaria de programa social", "programa social"]);
  const observacoes = [
    carimbo
      ? "Pré-inscrição Google Forms de " + formatarDataForms(carimbo) + "."
      : "Pré-inscrição Google Forms.",
    idade ? "Idade informada: " + idade + "." : null,
  ]
    .filter(Boolean)
    .join(" ");
  const restricaoTexto = [restricaoRaw, restricaoQual].filter(Boolean).join(" — ");
  const temRestricao = restricaoTexto ? !ehNao(restricaoTexto) : false;
  const temPcd = pcdRaw ? !ehNao(pcdRaw) : !!pcdQual;
  const identificaMulherRaw = valorColuna(row, [
    "voce se identifica como mulher",
    "identifica como mulher",
  ]);

  return {
    ...normalizarDadosOcr({}, {}),
    usa_nome_social: "nao",
    nome_social: "",
    idade_informada: idade,
    faixa_etaria: faixaEtariaInscricao({
      data_nascimento: "",
      idade_informada: idade,
      faixa_etaria: "",
    }),
    nome: valorColuna(row, ["nome completo", "nome"]),
    email: valorColuna(row, ["e mail", "email"]),
    telefone: onlyDigits(valorColuna(row, ["telefone whatsapp", "whatsapp", "telefone"])),
    endereco: valorColuna(row, [
      "endereco rua e numero",
      "endereco rua numero",
      "rua e numero",
      "endereco",
    ]),
    bairro_referencia: valorColuna(row, ["bairro", "bairro referencia"]),
    municipio: normalizarMunicipioForms(
      valorColuna(row, ["cidade", "municipio"]),
      municipiosOficiais,
    ),
    turno_preferido: normalizarTurnoForms(valorColuna(row, ["qual turno", "turno"])),
    disponibilidade_outros_turnos: simNao(
      valorColuna(row, [
        "disponibilidade em mais de um turno",
        "mais de um turno",
        "outros turnos",
      ]),
    ),
    tamanho_camisa: normalizarCamisa(valorColuna(row, ["tamanho da camisa", "camisa"])),
    restricao_alimentar: temRestricao,
    qual_restricao_alimentar: temRestricao ? restricaoTexto : "",
    pcd: temPcd,
    tipo_deficiencia: temPcd ? pcdQual || pcdRaw : "",
    situacao_trabalho: normalizarTrabalho(
      valorColuna(row, ["atualmente voce esta trabalhando", "trabalhando", "situacao trabalho"]),
    ),
    renda_familiar: normalizarRenda(valorColuna(row, ["renda familiar", "renda"])),
    beneficiaria_programa_social: simNao(programaRaw),
    qual_programa_social: simNao(programaRaw) ? programaRaw : "",
    motivo_participacao: valorColuna(row, [
      "por que deseja participar",
      "porque deseja participar",
      "deseja participar",
    ]),
    autorizacao_dados: simNao(valorAutorizacaoForms(row)),
    autorizacao_dados_em: autorizacaoDadosEm,
    identifica_se_mulher: identificaMulherRaw
      ? simNao(identificaMulherRaw)
        ? "sim"
        : "nao"
      : "sim",
    observacoes,
  };
}

function chaveNomeMunicipio(
  dados: Pick<DadosInscricaoDigitalNormalizados, "nome" | "municipio">,
): string {
  return normalizarTextoComparacao(dados.nome) + "::" + normalizarTextoComparacao(dados.municipio);
}

type InscricaoExistenteGoogleForms = {
  id: string;
  status: string;
  dados: DadosInscricaoDigitalNormalizados;
};

function valorPreenchidoGoogleForms(valor: unknown): boolean {
  if (typeof valor === "string") return valor.trim().length > 0;
  if (typeof valor === "number") return Number.isFinite(valor);
  if (typeof valor === "boolean") return valor;
  if (Array.isArray(valor)) return valor.some((item) => valorPreenchidoGoogleForms(item));
  if (valor && typeof valor === "object")
    return Object.values(valor).some(valorPreenchidoGoogleForms);
  return false;
}

function dividirEmLotes<T>(itens: T[], tamanho = 150): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

function mesclarDadosGoogleForms(
  atual: DadosInscricaoDigitalNormalizados,
  importado: DadosInscricaoDigitalNormalizados,
): DadosInscricaoDigitalNormalizados {
  const mesclado: Record<string, unknown> = { ...atual };
  for (const [campo, valor] of Object.entries(importado)) {
    if (
      [
        "confiancas",
        "observacoes",
        "motivo_rejeicao",
        "arquivo_nome_original",
        "drive_arquivo_id",
      ].includes(campo)
    ) {
      continue;
    }
    const existente = mesclado[campo];
    if (campo === "autorizacao_dados_em" && valorPreenchidoGoogleForms(valor)) {
      mesclado[campo] = valor;
      continue;
    }
    if (campo === "autorizacao_dados" && valor === true) {
      mesclado[campo] = true;
      continue;
    }
    if (typeof valor === "boolean") {
      if (valor === true && existente !== true) mesclado[campo] = true;
      continue;
    }
    if (!valorPreenchidoGoogleForms(existente) && valorPreenchidoGoogleForms(valor)) {
      mesclado[campo] = valor;
    }
  }

  const observacoes = [String(atual.observacoes ?? "")];
  for (const trecho of String(importado.observacoes ?? "")
    .split(/(?<=\.)\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean)) {
    if (!observacoes.join(" ").includes(trecho)) observacoes.push(trecho);
  }
  mesclado.observacoes = observacoes.filter(Boolean).join(" ").trim();
  mesclado.confiancas = { ...(atual.confiancas ?? {}), ...(importado.confiancas ?? {}) };
  mesclado.faixa_etaria = faixaEtariaInscricao({
    data_nascimento: String(mesclado.data_nascimento ?? ""),
    idade_informada: String(mesclado.idade_informada ?? ""),
    faixa_etaria: String(mesclado.faixa_etaria ?? ""),
  });
  return normalizarDadosOcr(mesclado, mesclado.confiancas);
}

async function prepararPreviewGoogleForms(
  admin: any,
  projetoId: string,
  arquivo: ArquivoPlanilhaGoogleForms,
  reprocessarExistentes = false,
): Promise<
  ResultadoPreviewGoogleForms & {
    dadosImportar: DadosInscricaoDigitalNormalizados[];
    dadosAtualizar: Array<{ id: string; dados: DadosInscricaoDigitalNormalizados }>;
  }
> {
  const [turmasRes, inscricoesRes] = await Promise.all([
    admin.from("turmas").select("municipio").eq("projeto_id", projetoId).limit(500),
    admin
      .from("inscricoes_digitais")
      .select("id, status, dados")
      .eq("projeto_id", projetoId)
      .limit(10000),
  ]);
  if (turmasRes.error) throw new Error(turmasRes.error.message);
  if (inscricoesRes.error) throw new Error(inscricoesRes.error.message);
  const municipiosOficiais: string[] = Array.from(
    new Set((turmasRes.data ?? []).map((t: any) => texto(t.municipio)).filter(Boolean)),
  );
  const inscricoesPorTelefone = new Map<string, InscricaoExistenteGoogleForms>();
  const inscricoesPorNomeMunicipio = new Map<string, InscricaoExistenteGoogleForms>();
  for (const row of (inscricoesRes.data ?? []) as any[]) {
    const dados = normalizarDadosOcr(row.dados, row.dados?.confiancas);
    const existente: InscricaoExistenteGoogleForms = {
      id: String(row.id),
      status: texto(row.status),
      dados,
    };
    const telefone = onlyDigits(dados.telefone);
    if (telefone && !inscricoesPorTelefone.has(telefone))
      inscricoesPorTelefone.set(telefone, existente);
    if (dados.nome && dados.municipio) {
      const chave = chaveNomeMunicipio(dados);
      if (!inscricoesPorNomeMunicipio.has(chave)) inscricoesPorNomeMunicipio.set(chave, existente);
    }
  }
  const telefonesArquivo = new Set<string>();
  const nomesArquivo = new Set<string>();
  const rows = await lerPlanilhaGoogleForms(arquivo);
  const resumo = {
    total: rows.length,
    importar: 0,
    atualizar: 0,
    duplicada: 0,
    nao_elegivel: 0,
    sem_autorizacao: 0,
    erro: 0,
    fora_area: 0,
    menor_idade: 0,
  } satisfies ResumoPreviewGoogleForms;
  const linhas: LinhaPreviewGoogleForms[] = [];
  const dadosImportar: DadosInscricaoDigitalNormalizados[] = [];
  const dadosAtualizar: Array<{ id: string; dados: DadosInscricaoDigitalNormalizados }> = [];
  rows.forEach((row, index) => {
    try {
      const dados = dadosGoogleForms(row, municipiosOficiais);
      const municipioEmArea = municipiosOficiais.some(
        (municipio) =>
          normalizarTextoComparacao(municipio) === normalizarTextoComparacao(dados.municipio),
      );
      const foraArea = !!dados.municipio && !municipioEmArea;
      const idadeInformada = idadeReferenciaInscricao(dados);
      const menorIdade = idadeInformada != null && idadeInformada < 18;
      if (foraArea) {
        resumo.fora_area += 1;
        adicionarObservacaoGoogleForms(
          dados,
          `Município fora da área de turmas cadastradas: ${dados.municipio}.`,
        );
      }
      if (menorIdade) {
        resumo.menor_idade += 1;
        adicionarObservacaoGoogleForms(dados, "Menor de 18 anos pela idade informada no Forms.");
      }
      let status: StatusLinhaGoogleForms = "importar";
      let motivo = foraArea ? "Fora da área de turmas; coordenação decide" : "Pronta para importar";
      if (dados.identifica_se_mulher !== "sim") {
        status = "nao_elegivel";
        motivo = "Não elegível pelo critério do edital";
      } else if (!dados.autorizacao_dados) {
        status = "sem_autorizacao";
        motivo = "Sem consentimento LGPD";
      } else {
        const telefone = onlyDigits(dados.telefone);
        const chaveNome = chaveNomeMunicipio(dados);
        const duplicadaArquivo = telefone
          ? telefonesArquivo.has(telefone)
          : !!(dados.nome && dados.municipio && nomesArquivo.has(chaveNome));
        const existente = telefone
          ? inscricoesPorTelefone.get(telefone)
          : dados.nome && dados.municipio
            ? inscricoesPorNomeMunicipio.get(chaveNome)
            : undefined;
        if (duplicadaArquivo) {
          status = "duplicada";
          motivo = "Linha repetida dentro do próprio arquivo";
        } else if (existente) {
          if (reprocessarExistentes && existente.status !== "aprovada") {
            status = "atualizar";
            motivo = "Inscrição existente será reprocessada para preencher dados faltantes";
            dadosAtualizar.push({
              id: existente.id,
              dados: mesclarDadosGoogleForms(existente.dados, dados),
            });
          } else {
            status = "duplicada";
            motivo =
              existente.status === "aprovada"
                ? "Inscrição já aprovada; não será reprocessada"
                : reprocessarExistentes
                  ? "Inscrição já encontrada"
                  : "Inscrição já importada/cadastrada";
          }
        }
      }
      if (status === "importar" || status === "atualizar") {
        const telefone = onlyDigits(dados.telefone);
        if (telefone) telefonesArquivo.add(telefone);
        if (dados.nome && dados.municipio) nomesArquivo.add(chaveNomeMunicipio(dados));
      }
      if (status === "importar") dadosImportar.push(dados);
      resumo[status] += 1;
      linhas.push({
        linha: index + 2,
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone,
        idadeInformada: idadeInformada != null ? String(idadeInformada) : "",
        municipio: dados.municipio,
        bairroReferencia: dados.bairro_referencia,
        turnoPreferido: dados.turno_preferido,
        autorizacaoDados: dados.autorizacao_dados,
        status,
        motivo,
        foraArea,
        menorIdade,
      });
    } catch (error) {
      resumo.erro += 1;
      linhas.push({
        linha: index + 2,
        nome: "",
        email: "",
        telefone: "",
        idadeInformada: "",
        municipio: "",
        bairroReferencia: "",
        turnoPreferido: "",
        autorizacaoDados: false,
        status: "erro",
        motivo: error instanceof Error ? error.message : String(error),
        foraArea: false,
        menorIdade: false,
      });
    }
  });
  return { resumo, linhas, dadosImportar, dadosAtualizar };
}
export const previewImportacaoGoogleForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({
        projetoId: UUID,
        arquivo: ArquivoGoogleFormsSchema,
        reprocessarExistentes: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ResultadoPreviewGoogleForms> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const preview = await prepararPreviewGoogleForms(
      admin,
      data.projetoId,
      data.arquivo,
      data.reprocessarExistentes,
    );
    return { resumo: preview.resumo, linhas: preview.linhas };
  });

export const confirmarImportacaoGoogleForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({
        projetoId: UUID,
        arquivo: ArquivoGoogleFormsSchema,
        reprocessarExistentes: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ResultadoPreviewGoogleForms> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const preview = await prepararPreviewGoogleForms(
      admin,
      data.projetoId,
      data.arquivo,
      data.reprocessarExistentes,
    );
    const resumoFinal = { ...preview.resumo, importar: 0, atualizar: 0 };
    const linhas = [...preview.linhas];

    for (const lote of dividirEmLotes(preview.dadosAtualizar, 150)) {
      const atualizadoEm = new Date().toISOString();
      const registros = lote.map((item) => ({
        id: item.id,
        projeto_id: data.projetoId,
        dados: item.dados,
        atualizado_em: atualizadoEm,
      }));
      try {
        const { error } = await admin
          .from("inscricoes_digitais")
          .upsert(registros, { onConflict: "id" });
        if (error) throw new Error(error.message);
        resumoFinal.atualizar += lote.length;
      } catch (error) {
        resumoFinal.erro += lote.length;
        linhas.push({
          linha: 0,
          nome: `${lote.length} inscri??o(?es) existente(s)`,
          email: "",
          telefone: "",
          idadeInformada: "",
          municipio: "",
          bairroReferencia: "",
          turnoPreferido: "",
          autorizacaoDados: false,
          status: "erro",
          motivo: `Falha ao atualizar lote de ${lote.length}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          foraArea: false,
          menorIdade: false,
        });
      }
    }

    for (const lote of dividirEmLotes(preview.dadosImportar, 150)) {
      const registros = lote.map((dados) => ({
        projeto_id: data.projetoId,
        turma_id: null,
        origem: "google_forms",
        status: "pendente",
        dados,
      }));
      try {
        const { error } = await admin.from("inscricoes_digitais").insert(registros);
        if (error) throw new Error(error.message);
        resumoFinal.importar += lote.length;
      } catch (error) {
        resumoFinal.erro += lote.length;
        linhas.push({
          linha: 0,
          nome: `${lote.length} nova(s) inscri??o(?es)`,
          email: "",
          telefone: "",
          idadeInformada: "",
          municipio: "",
          bairroReferencia: "",
          turnoPreferido: "",
          autorizacaoDados: false,
          status: "erro",
          motivo: `Falha ao inserir lote de ${lote.length}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          foraArea: false,
          menorIdade: false,
        });
      }
    }

    return { resumo: resumoFinal, linhas };
  });

function turnoRelatorio(valor: string): string {
  return valor || "Não informado";
}

function percentual(total: number, base: number): number {
  if (!base) return 0;
  return total / base;
}

function incrementar(map: Map<string, number>, label: string, valor = 1): void {
  map.set(label, (map.get(label) ?? 0) + valor);
}

function distribuicao(map: Map<string, number>, base: number): DashboardDistribuicaoItem[] {
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total, percentual: percentual(total, base) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));
}

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return valores.reduce((sum, valor) => sum + valor, 0) / valores.length;
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2) return ordenados[meio];
  return (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function faixaEtariaDashboard(idade: number | null): string {
  if (idade == null) return "Não informada";
  if (idade <= 15) return "Até 15 anos";
  if (idade <= 17) return "16 a 17 anos";
  if (idade <= 24) return "18 a 24 anos";
  if (idade <= 34) return "25 a 34 anos";
  if (idade <= 44) return "35 a 44 anos";
  if (idade <= 54) return "45 a 54 anos";
  if (idade <= 60) return "55 a 60 anos";
  return "Acima de 60 anos";
}

function simNaoDashboard(valor: boolean): string {
  return valor ? "Sim" : "Não";
}

async function montarDashboardInscricoes(
  admin: any,
  projetoId: string,
): Promise<DashboardInscricoes> {
  const [inscricoesRes, turmasRes] = await Promise.all([
    admin
      .from("inscricoes_digitais")
      .select("status, origem, dados, documento_path")
      .eq("projeto_id", projetoId)
      .limit(10000),
    admin.from("turmas").select("municipio, turno, vagas").eq("projeto_id", projetoId).limit(1000),
  ]);
  if (inscricoesRes.error) throw new Error(inscricoesRes.error.message);
  if (turmasRes.error) throw new Error(turmasRes.error.message);

  const municipiosComTurma = new Set<string>();
  const ofertaMunicipio = new Map<string, { turmas: number; vagas: number }>();
  for (const turma of (turmasRes.data ?? []) as any[]) {
    const municipio = texto(turma.municipio) || "Não informado";
    const key = normalizarTextoComparacao(municipio);
    municipiosComTurma.add(key);
    const atual = ofertaMunicipio.get(key) ?? { turmas: 0, vagas: 0 };
    atual.turmas += 1;
    atual.vagas += Number(turma.vagas ?? 0) || 0;
    ofertaMunicipio.set(key, atual);
  }

  const porTrabalho = new Map<string, number>();
  const porRenda = new Map<string, number>();
  const porTurno = new Map<string, number>();
  const porCamisa = new Map<string, number>();
  const porProgramaSocial = new Map<string, number>();
  const porDisponibilidadeTurnos = new Map<string, number>();
  const porRestricaoAlimentar = new Map<string, number>();
  const porDeficiencia = new Map<string, number>();
  const porOrigem = new Map<string, number>();
  const porStatus = new Map<string, number>();
  const pendencias = new Map<string, number>();
  const idades: number[] = [];
  const municipioMap = new Map<
    string,
    {
      label: string;
      total: number;
      idades: number[];
      naoTrabalhando: number;
      ateUmSalario: number;
      programaSocial: number;
      turnos: Record<string, number>;
    }
  >();
  const faixaMap = new Map<
    string,
    {
      label: string;
      total: number;
      naoTrabalhando: number;
      ateUmSalario: number;
      programaSocial: number;
      manha: number;
      noite: number;
    }
  >();
  const bairroMap = new Map<
    string,
    {
      municipio: string;
      bairro: string;
      total: number;
      manha: number;
      noite: number;
    }
  >();
  const totalPorMunicipio = new Map<string, number>();

  let total = 0;
  let pendentes = 0;
  let emRevisao = 0;
  let aprovadas = 0;
  let rejeitadas = 0;
  let duplicadas = 0;
  let elegiveisPreliminarmente = 0;
  let cadastrosParaRevisao = 0;
  let semDocumento = 0;
  let menoresDe18 = 0;
  let acimaDe60 = 0;
  let foraAreaTurmas = 0;

  for (const row of (inscricoesRes.data ?? []) as any[]) {
    const dados = normalizarDadosOcr(row.dados, row.dados?.confiancas);
    const status = (row.status as StatusInscricaoDigital) ?? "pendente";
    const origem = texto(row.origem) || "Não informada";
    const municipio = dados.municipio || "Não informado";
    const municipioKey = normalizarTextoComparacao(municipio);
    const bairro = dados.bairro_referencia || "Não informado";
    const turno = turnoRelatorio(dados.turno_preferido);
    const idade = idadeReferenciaInscricao(dados);
    const faixa = faixaEtariaDashboard(idade);
    const naoTrabalhando = dados.situacao_trabalho === "Não estou trabalhando";
    const ateUmSalario = dados.renda_familiar === "Até 1 salário mínimo";
    const programaSocial = dados.beneficiaria_programa_social || !!dados.qual_programa_social;
    const temRestricao = dados.restricao_alimentar || !!dados.qual_restricao_alimentar;
    const temDeficiencia = dados.pcd || !!dados.tipo_deficiencia;
    const consentimento = dados.autorizacao_dados || !!dados.autorizacao_dados_em;
    const mulher = dados.identifica_se_mulher === "sim";
    const foraArea = municipioKey ? !municipiosComTurma.has(municipioKey) : true;
    const semDoc = !texto(row.documento_path);
    const precisaRevisao =
      status === "duplicada" ||
      semDoc ||
      foraArea ||
      !mulher ||
      !consentimento ||
      (idade != null && (idade < 16 || idade > 60));

    total += 1;
    if (status === "pendente") pendentes += 1;
    if (status === "em_revisao") emRevisao += 1;
    if (status === "aprovada") aprovadas += 1;
    if (status === "rejeitada") rejeitadas += 1;
    if (status === "duplicada") duplicadas += 1;
    if (semDoc) semDocumento += 1;
    if (foraArea) foraAreaTurmas += 1;
    if (idade != null) {
      idades.push(idade);
      if (idade < 18) menoresDe18 += 1;
      if (idade > 60) acimaDe60 += 1;
    }
    if (mulher && consentimento && (idade == null || (idade >= 16 && idade <= 60))) {
      elegiveisPreliminarmente += 1;
    }
    if (precisaRevisao) cadastrosParaRevisao += 1;

    incrementar(porTrabalho, dados.situacao_trabalho || "Não informado");
    incrementar(porRenda, dados.renda_familiar || "Não informado");
    incrementar(porTurno, turno);
    incrementar(porCamisa, dados.tamanho_camisa || "Não informado");
    incrementar(porProgramaSocial, simNaoDashboard(programaSocial));
    incrementar(porDisponibilidadeTurnos, simNaoDashboard(dados.disponibilidade_outros_turnos));
    incrementar(porRestricaoAlimentar, simNaoDashboard(temRestricao));
    incrementar(porDeficiencia, simNaoDashboard(temDeficiencia));
    incrementar(porOrigem, origem);
    incrementar(porStatus, status);
    if (semDoc) incrementar(pendencias, "Documento pendente");
    if (foraArea) incrementar(pendencias, "Fora da ?rea de turmas");
    if (!mulher) incrementar(pendencias, "Não se identifica como mulher");
    if (!consentimento) incrementar(pendencias, "Consentimento não confirmado");
    if (status === "duplicada") incrementar(pendencias, "Inscrição duplicada");
    if (idade != null && idade < 16) incrementar(pendencias, "Abaixo de 16 anos");
    if (idade != null && idade >= 16 && idade < 18) incrementar(pendencias, "Menor de 18 anos");
    if (idade != null && idade > 60) incrementar(pendencias, "Acima de 60 anos");

    const municipioAtual = municipioMap.get(municipioKey) ?? {
      label: municipio,
      total: 0,
      idades: [],
      naoTrabalhando: 0,
      ateUmSalario: 0,
      programaSocial: 0,
      turnos: {},
    };
    municipioAtual.total += 1;
    if (idade != null) municipioAtual.idades.push(idade);
    if (naoTrabalhando) municipioAtual.naoTrabalhando += 1;
    if (ateUmSalario) municipioAtual.ateUmSalario += 1;
    if (programaSocial) municipioAtual.programaSocial += 1;
    municipioAtual.turnos[turno] = (municipioAtual.turnos[turno] ?? 0) + 1;
    municipioMap.set(municipioKey, municipioAtual);
    totalPorMunicipio.set(municipioKey, (totalPorMunicipio.get(municipioKey) ?? 0) + 1);

    const faixaAtual = faixaMap.get(faixa) ?? {
      label: faixa,
      total: 0,
      naoTrabalhando: 0,
      ateUmSalario: 0,
      programaSocial: 0,
      manha: 0,
      noite: 0,
    };
    faixaAtual.total += 1;
    if (naoTrabalhando) faixaAtual.naoTrabalhando += 1;
    if (ateUmSalario) faixaAtual.ateUmSalario += 1;
    if (programaSocial) faixaAtual.programaSocial += 1;
    if (turno === "manha") faixaAtual.manha += 1;
    if (turno === "noite") faixaAtual.noite += 1;
    faixaMap.set(faixa, faixaAtual);

    const bairroKey = `${municipioKey}::${normalizarTextoComparacao(bairro)}`;
    const bairroAtual = bairroMap.get(bairroKey) ?? {
      municipio,
      bairro,
      total: 0,
      manha: 0,
      noite: 0,
    };
    bairroAtual.total += 1;
    if (turno === "manha") bairroAtual.manha += 1;
    if (turno === "noite") bairroAtual.noite += 1;
    bairroMap.set(bairroKey, bairroAtual);
  }

  const porMunicipio = Array.from(municipioMap.entries())
    .map(([key, item]) => {
      const oferta = ofertaMunicipio.get(key) ?? { turmas: 0, vagas: 0 };
      return {
        label: item.label,
        total: item.total,
        percentual: percentual(item.total, total),
        idadeMedia: media(item.idades),
        naoTrabalhando: item.naoTrabalhando,
        ateUmSalario: item.ateUmSalario,
        programaSocial: item.programaSocial,
        turnos: item.turnos,
        turmas: oferta.turmas,
        vagas: oferta.vagas,
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));

  const ordemFaixas = [
    "Até 15 anos",
    "16 a 17 anos",
    "18 a 24 anos",
    "25 a 34 anos",
    "35 a 44 anos",
    "45 a 54 anos",
    "55 a 60 anos",
    "Acima de 60 anos",
    "Não informada",
  ];
  const porFaixaEtaria = Array.from(faixaMap.values())
    .map((item) => ({ ...item, percentual: percentual(item.total, total) }))
    .sort((a, b) => ordemFaixas.indexOf(a.label) - ordemFaixas.indexOf(b.label));

  const porBairro = Array.from(bairroMap.entries())
    .map(([key, item]) => {
      const municipioKey = key.split("::")[0];
      return {
        label: `${item.municipio} ? ${item.bairro}`,
        municipio: item.municipio,
        bairro: item.bairro,
        total: item.total,
        percentual: percentual(item.total, total),
        percentualCidade: percentual(item.total, totalPorMunicipio.get(municipioKey) ?? 0),
        manha: item.manha,
        noite: item.noite,
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));

  return {
    geradoEm: new Date().toISOString(),
    total,
    pendentes,
    emRevisao,
    aprovadas,
    rejeitadas,
    duplicadas,
    elegiveisPreliminarmente,
    cadastrosParaRevisao,
    semDocumento,
    menoresDe18,
    acimaDe60,
    foraAreaTurmas,
    idadeMedia: media(idades),
    idadeMediana: mediana(idades),
    concentracaoPrincipal: porMunicipio[0]
      ? { municipio: porMunicipio[0].label, percentual: porMunicipio[0].percentual }
      : null,
    porMunicipio,
    porFaixaEtaria,
    porTrabalho: distribuicao(porTrabalho, total),
    porRenda: distribuicao(porRenda, total),
    porTurno: distribuicao(porTurno, total),
    porCamisa: distribuicao(porCamisa, total),
    porProgramaSocial: distribuicao(porProgramaSocial, total),
    porDisponibilidadeTurnos: distribuicao(porDisponibilidadeTurnos, total),
    porRestricaoAlimentar: distribuicao(porRestricaoAlimentar, total),
    porDeficiencia: distribuicao(porDeficiencia, total),
    porOrigem: distribuicao(porOrigem, total),
    porStatus: distribuicao(porStatus, total),
    porBairro,
    pendencias: distribuicao(pendencias, total),
  };
}

async function montarRelatorioInscricoes(
  admin: any,
  projetoId: string,
): Promise<RelatorioInscricoesRegiao> {
  const [inscricoesRes, turmasRes] = await Promise.all([
    admin
      .from("inscricoes_digitais")
      .select("status, dados")
      .eq("projeto_id", projetoId)
      .limit(10000),
    admin.from("turmas").select("municipio, turno, vagas").eq("projeto_id", projetoId).limit(1000),
  ]);
  if (inscricoesRes.error) throw new Error(inscricoesRes.error.message);
  if (turmasRes.error) throw new Error(turmasRes.error.message);
  const oferta = new Map<string, { turmas: number; vagas: number }>();
  for (const turma of (turmasRes.data ?? []) as any[]) {
    const municipio = texto(turma.municipio) || "Não informado";
    const turno = turnoRelatorio(turnoPreferido(turma.turno) || texto(turma.turno));
    const key = normalizarTextoComparacao(municipio) + "::" + turno;
    const atual = oferta.get(key) ?? { turmas: 0, vagas: 0 };
    atual.turmas += 1;
    atual.vagas += Number(turma.vagas ?? 0) || 0;
    oferta.set(key, atual);
  }
  const linhasMap = new Map<string, RelatorioInscricoesLinha>();
  const municipioMap = new Map<
    string,
    {
      municipio: string;
      total: number;
      pendentes: number;
      porTurno: Record<string, number>;
      turmas: number;
      vagas: number;
    }
  >();
  const porTurno: Record<string, number> = {};
  let total = 0;
  let pendentes = 0;
  for (const row of (inscricoesRes.data ?? []) as any[]) {
    const dados = normalizarDadosOcr(row.dados, row.dados?.confiancas);
    const municipio = dados.municipio || "Não informado";
    const bairro = dados.bairro_referencia || "Não informado";
    const turno = turnoRelatorio(dados.turno_preferido);
    const status = (row.status as StatusInscricaoDigital) ?? "pendente";
    const ofertaKey = normalizarTextoComparacao(municipio) + "::" + turno;
    const ofertaLinha = oferta.get(ofertaKey) ?? { turmas: 0, vagas: 0 };
    const key = municipio + "::" + bairro + "::" + turno;
    const linha = linhasMap.get(key) ?? {
      municipio,
      bairroReferencia: bairro,
      turnoPreferido: turno,
      total: 0,
      pendentes: 0,
      emRevisao: 0,
      aprovadas: 0,
      rejeitadas: 0,
      duplicadas: 0,
      turmas: ofertaLinha.turmas,
      vagas: ofertaLinha.vagas,
      demandaSemOferta: false,
    };
    linha.total += 1;
    if (status === "pendente") linha.pendentes += 1;
    else if (status === "em_revisao") linha.emRevisao += 1;
    else if (status === "aprovada") linha.aprovadas += 1;
    else if (status === "rejeitada") linha.rejeitadas += 1;
    else if (status === "duplicada") linha.duplicadas += 1;
    linha.demandaSemOferta =
      linha.total > 0 && (linha.turmas === 0 || (linha.vagas > 0 && linha.total > linha.vagas));
    linhasMap.set(key, linha);
    total += 1;
    if (status === "pendente") pendentes += 1;
    porTurno[turno] = (porTurno[turno] ?? 0) + 1;
    const munKey = normalizarTextoComparacao(municipio);
    const mun = municipioMap.get(munKey) ?? {
      municipio,
      total: 0,
      pendentes: 0,
      porTurno: {},
      turmas: 0,
      vagas: 0,
    };
    mun.total += 1;
    if (status === "pendente") mun.pendentes += 1;
    mun.porTurno[turno] = (mun.porTurno[turno] ?? 0) + 1;
    municipioMap.set(munKey, mun);
  }
  for (const [key, valor] of oferta) {
    const municipioNorm = key.split("::")[0];
    const mun = municipioMap.get(municipioNorm);
    if (mun) {
      mun.turmas += valor.turmas;
      mun.vagas += valor.vagas;
    }
  }
  return {
    geradoEm: new Date().toISOString(),
    total,
    pendentes,
    porTurno,
    porMunicipio: Array.from(municipioMap.values()).sort((a, b) => b.total - a.total),
    linhas: Array.from(linhasMap.values()).sort((a, b) => b.total - a.total),
  };
}

export const listarRelatorioInscricoesPorRegiao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => ProjetoInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    return montarRelatorioInscricoes(admin, data.projetoId);
  });

export const listarDashboardInscricoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => ProjetoInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    return montarDashboardInscricoes(admin, data.projetoId);
  });

export const gerarAnaliseIaRelatorioInscricoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => ProjetoInput.parse(input))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const relatorio = await montarRelatorioInscricoes(admin, data.projetoId);
    const { executarAiRouter } = await import("@/lib/ia.functions");
    const prompt =
      "Analise as inscrições do projeto Mulheres Conectadas por região, bairro e turno. Responda em português brasileiro, em tópicos objetivos, com: 1) leitura da demanda por município/turno; 2) regiões com demanda sem oferta ou acima das vagas; 3) recomendações de alocação/abertura de turmas; 4) alertas operacionais. Dados agregados JSON:\n" +
      JSON.stringify(relatorio, null, 2);
    const resposta = await executarAiRouter({
      admin,
      processo: "relatorio_inscricoes",
      mensagens: [
        {
          role: "system",
          content:
            "Você é uma analista de planejamento pedagógico e territorial do projeto Mulheres Conectadas.",
        },
        { role: "user", content: prompt },
      ],
      defaults: { max_tokens: 1800, temperatura: 0.25 },
    });
    try {
      await admin.from("agent_runs").insert({
        processo: "relatorio_inscricoes",
        status: "concluido",
        entrada: relatorio,
        saida: resposta.content,
        user_id: context.userId,
      });
    } catch {
      // Tabela/colunas variam entre instalações; ia_logs_uso já registra a chamada.
    }
    return {
      analise: resposta.content,
      relatorio,
      provedor: resposta.provedor,
      modelo: resposta.modelo,
    };
  });

export const listarArquivosDriveParaInscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => ProjetoInput.parse(input))
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data, error } = await admin
      .from("drive_arquivos")
      .select("id, gdrive_id, nome, mime_type, tipo, tamanho, pasta_caminho, atualizado_em")
      .in("tipo", ["pdf", "imagem"])
      .order("atualizado_em", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      gdrive_id: string;
      nome: string;
      mime_type: string | null;
      tipo: string;
      tamanho: number | null;
      pasta_caminho: string | null;
      atualizado_em: string;
    }>;
  });

const ArquivoDiretoSchema = z.object({
  nome: z.string().trim().min(1).max(240),
  mime: z.string().regex(/^(application\/pdf|image\/(png|jpe?g))$/i),
  base64: z.string().min(20).max(30_000_000),
});

export const importarFichaComOcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({
        projetoId: UUID,
        turmaId: UUID.nullable().optional(),
        driveArquivoId: UUID.optional(),
        arquivo: ArquivoDiretoSchema.optional(),
      })
      .refine((valor) => Number(!!valor.driveArquivoId) + Number(!!valor.arquivo) === 1, {
        message: "Informe um arquivo do Drive ou um upload direto.",
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    let nome = data.arquivo?.nome ?? "ficha-matricula";
    let mime = data.arquivo?.mime ?? "application/octet-stream";
    let base64 = data.arquivo?.base64 ?? "";
    let driveId = "";

    if (data.driveArquivoId) {
      const { data: driveRow, error } = await admin
        .from("drive_arquivos")
        .select("gdrive_id, nome, mime_type, tipo, tamanho")
        .eq("id", data.driveArquivoId)
        .maybeSingle();
      if (error || !driveRow || !["pdf", "imagem"].includes(driveRow.tipo)) {
        throw new Error("Arquivo do Drive não encontrado ou incompatível.");
      }
      if ((driveRow.tamanho ?? 0) > 20 * 1024 * 1024) {
        throw new Error("O arquivo excede o limite de 20 MB.");
      }
      const drive = await import("@/lib/gdrive-helpers.server");
      const download = await drive.downloadFileBase64(driveRow.gdrive_id);
      nome = driveRow.nome;
      mime = driveRow.mime_type || download.contentType;
      base64 = download.base64;
      driveId = driveRow.gdrive_id;
    }

    const ehPdf = mime.toLowerCase() === "application/pdf";
    const pdfBase64 = ehPdf ? base64 : await imagemParaPdf(base64, mime);
    const storagePath = `${data.projetoId}/${crypto.randomUUID()}-ficha-matricula.pdf`;
    const { error: uploadError } = await admin.storage
      .from("evidencias")
      .upload(storagePath, bytesDeBase64(pdfBase64), {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw new Error(`Falha ao arquivar a ficha: ${uploadError.message}`);

    try {
      const { executarVisaoRouter } = await import("@/lib/ia.functions");
      const prompt = `Você é um extrator de fichas de matrícula do projeto Mulheres Conectadas.
Leia somente o que estiver visível. Não invente dados. Retorne APENAS JSON válido neste formato:
{
  "dados": {
    "nome": "", "usa_nome_social": "nao", "nome_social": "",
    "cpf": "", "data_nascimento": "AAAA-MM-DD ou vazio", "idade_informada": "", "faixa_etaria": "",
    "genero": "", "raca": "", "pcd": false, "tipo_deficiencia": "",
    "telefone": "", "email": "", "endereco": "", "municipio": "",
    "bairro_referencia": "", "turno_preferido": "",
    "identifica_se_mulher": "", "disponibilidade_outros_turnos": false,
    "tamanho_camisa": "", "restricao_alimentar": false,
    "qual_restricao_alimentar": "", "situacao_trabalho": "",
    "renda_familiar": "", "motivo_participacao": "",
    "contatos_emergencia": [
      { "nome": "", "telefone": "", "parentesco": "" },
      { "nome": "", "telefone": "", "parentesco": "" }
    ],
    "autorizacao_dados": false, "autorizacao_dados_em": "",
    "nis": "", "beneficiaria_programa_social": false,
    "qual_programa_social": "", "banco": "", "agencia": "", "conta": "",
    "observacoes": ""
  },
  "confiancas": { "nome": 0.0, "cpf": 0.0, "contatos_emergencia.0.nome": 0.0 },
  "confianca_geral": 0.0
}
Use "sim" ou "nao" em identifica_se_mulher; P, M, G, GG ou XG em tamanho_camisa;
"manha", "tarde", "noite" ou "qualquer" em turno_preferido; e os textos exatos das opções
de situação de trabalho e renda familiar apresentados na ficha.
Inclua em "confiancas" todos os campos retornados, inclusive nome_social, idade_informada, faixa_etaria, os campos dos dois contatos,
turno_preferido, polo_preferido e bairro_referencia, usando valores entre 0 e 1.
Campos ausentes ou ilegíveis devem ser string vazia (ou false) e confiança 0.`;
      const visao = await executarVisaoRouter({
        admin,
        processo: "matricula_ocr",
        prompt,
        imagens: [{ mime, base64 }],
        defaults: { max_tokens: 4096 },
      });
      const extraido = parseJsonFlexivel(visao.content);
      const dadosOcr = normalizarDadosOcr(extraido.dados, extraido.confiancas);
      dadosOcr.arquivo_nome_original = nome;
      dadosOcr.drive_arquivo_id = driveId;
      const confianca = numeroConfianca(extraido.confianca_geral);
      const { data: inscricao, error: insertError } = await admin
        .from("inscricoes_digitais")
        .insert({
          projeto_id: data.projetoId,
          turma_id: data.turmaId ?? null,
          origem: "ocr",
          status: "pendente",
          dados: dadosOcr,
          arquivo_origem_path: `evidencias:${storagePath}`,
          confianca_ocr: confianca,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      return { id: inscricao.id as string, nome, confianca };
    } catch (error) {
      await admin.storage.from("evidencias").remove([storagePath]);
      throw error;
    }
  });

export const anexarDocumentoInscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: UUID,
        projetoId: UUID,
        tipo: z.enum(["documento", "comprovante"]),
        arquivo: AnexoPublicoSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data: row, error: readError } = await admin
      .from("inscricoes_digitais")
      .select("id, documento_path, comprovante_path")
      .eq("id", data.id)
      .eq("projeto_id", data.projetoId)
      .maybeSingle();
    if (readError || !row) throw new Error("Inscrição não encontrada.");

    const bytes = await anexoEmPdf(data.arquivo.base64, data.arquivo.mime);
    const storagePath = `inscricoes/${data.id}/${data.tipo}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("evidencias")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(
        `Falha ao arquivar ${data.tipo === "documento" ? "o documento" : "o comprovante"}: ${uploadError.message}`,
      );
    }

    const patch = {
      [data.tipo === "documento" ? "documento_path" : "comprovante_path"]:
        `evidencias:${storagePath}`,
      revisado_por: context.userId,
      revisado_em: new Date().toISOString(),
    };
    const { data: atualizado, error: updateError } = await admin
      .from("inscricoes_digitais")
      .update(patch)
      .eq("id", data.id)
      .eq("projeto_id", data.projetoId)
      .select("documento_path, comprovante_path")
      .single();
    if (updateError) throw new Error(updateError.message);

    return {
      documentoPath: atualizado.documento_path ?? null,
      documentoUrl: await urlArquivo(admin, atualizado.documento_path ?? null),
      comprovantePath: atualizado.comprovante_path ?? null,
      comprovanteUrl: await urlArquivo(admin, atualizado.comprovante_path ?? null),
    };
  });
export const salvarRevisaoInscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: UUID,
        projetoId: UUID,
        turmaId: UUID.nullable(),
        dados: z.record(z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const dados = normalizarDadosOcr(data.dados, data.dados.confiancas);
    dados.motivo_rejeicao = texto(data.dados.motivo_rejeicao);
    dados.arquivo_nome_original = texto(data.dados.arquivo_nome_original);
    dados.drive_arquivo_id = texto(data.dados.drive_arquivo_id);
    const { error } = await admin
      .from("inscricoes_digitais")
      .update({
        turma_id: data.turmaId,
        dados,
        status: "em_revisao",
        revisado_por: context.userId,
        revisado_em: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("projeto_id", data.projetoId)
      .in("status", ["pendente", "em_revisao", "duplicada"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejeitarInscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z.object({ id: UUID, projetoId: UUID, motivo: z.string().trim().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data: row, error: readError } = await admin
      .from("inscricoes_digitais")
      .select("dados")
      .eq("id", data.id)
      .eq("projeto_id", data.projetoId)
      .maybeSingle();
    if (readError || !row) throw new Error("Inscrição não encontrada.");
    const { error } = await admin
      .from("inscricoes_digitais")
      .update({
        status: "rejeitada",
        dados: { ...(row.dados ?? {}), motivo_rejeicao: data.motivo },
        revisado_por: context.userId,
        revisado_em: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("projeto_id", data.projetoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const aprovarInscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ id: UUID, projetoId: UUID }).parse(input))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const { data: row, error: readError } = await admin
      .from("inscricoes_digitais")
      .select("*")
      .eq("id", data.id)
      .eq("projeto_id", data.projetoId)
      .maybeSingle();
    if (readError || !row) throw new Error("Inscrição não encontrada.");
    if (!row.turma_id) throw new Error("Selecione a turma antes de aprovar.");
    if (row.status === "aprovada") return { duplicada: false, cursistaId: row.cursista_id };

    const parsed = dadosInscricaoDigitalSchema.safeParse(row.dados);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Revise os campos obrigatórios.");
    }
    const dados = parsed.data;
    if (!isValidCpf(dados.cpf)) throw new Error("CPF inválido. Corrija antes de aprovar.");
    const cpfFormatado = formatCpf(dados.cpf);
    const [cursistaRes, beneficiariaRes] = await Promise.all([
      admin.from("cursistas").select("id, nome").in("cpf", [dados.cpf, cpfFormatado]).limit(1),
      admin.from("beneficiarias").select("id, nome").in("cpf", [dados.cpf, cpfFormatado]).limit(1),
    ]);
    const existente = cursistaRes.data?.[0] ?? beneficiariaRes.data?.[0];
    if (existente) {
      await admin
        .from("inscricoes_digitais")
        .update({
          status: "duplicada",
          revisado_por: context.userId,
          revisado_em: new Date().toISOString(),
        })
        .eq("id", data.id);
      return {
        duplicada: true,
        cursistaId: existente.id as string,
        nome: existente.nome as string,
      };
    }

    const { data: turma, error: turmaError } = await admin
      .from("turmas")
      .select("id")
      .eq("id", row.turma_id)
      .eq("projeto_id", data.projetoId)
      .maybeSingle();
    if (turmaError || !turma) throw new Error("A turma selecionada não pertence ao projeto ativo.");

    const pessoaId = crypto.randomUUID();
    const beneficiaria = {
      id: pessoaId,
      nome: dados.nome,
      cpf: dados.cpf,
      data_nascimento: dados.data_nascimento || null,
      genero: dados.genero || null,
      raca: dados.raca || null,
      pcd: dados.pcd,
      tipo_deficiencia: dados.pcd ? dados.tipo_deficiencia || null : null,
      telefone: dados.telefone || null,
      email: dados.email || null,
      endereco: dados.endereco || null,
      municipio: dados.municipio || null,
      nis: dados.nis || null,
      beneficiaria_programa_social: dados.beneficiaria_programa_social,
      qual_programa_social: dados.beneficiaria_programa_social
        ? dados.qual_programa_social || null
        : null,
      banco: dados.banco || null,
      agencia: dados.agencia || null,
      conta: dados.conta || null,
      tamanho_camisa: dados.tamanho_camisa,
      restricao_alimentar: dados.restricao_alimentar
        ? dados.qual_restricao_alimentar || "Sim"
        : "Não",
      situacao_trabalho: dados.situacao_trabalho,
      renda_familiar: dados.renda_familiar,
      motivo_participacao: dados.motivo_participacao,
      contatos_emergencia: dados.contatos_emergencia,
      autorizacao_dados: dados.autorizacao_dados,
      autorizacao_dados_em: dados.autorizacao_dados_em || row.criado_em,
    };
    let beneficiariaCriada = false;
    let cursistaCriada = false;
    try {
      const { error: beneficiariaError } = await admin.from("beneficiarias").insert(beneficiaria);
      if (beneficiariaError) throw new Error(beneficiariaError.message);
      beneficiariaCriada = true;
      const { error: cursistaError } = await admin.from("cursistas").insert({
        id: pessoaId,
        nome: dados.nome,
        cpf: dados.cpf,
        telefone: dados.telefone || null,
        email: dados.email || null,
        municipio: dados.municipio || null,
      });
      if (cursistaError) throw new Error(cursistaError.message);
      cursistaCriada = true;
      const { error: matriculaError } = await admin.from("matriculas").insert({
        turma_id: row.turma_id,
        cursista_id: pessoaId,
        beneficiaria_id: pessoaId,
        status: "inscrita",
        data_inscricao: new Date().toISOString().slice(0, 10),
        ficha_inscricao_url: await urlArquivo(admin, row.arquivo_origem_path),
        observacao_importacao: [
          `Inscrição digital ${row.id} (${row.origem}).`,
          dados.nome_social ? `Nome social informado: ${dados.nome_social}.` : null,

          row.documento_path ? `Documento: ${row.documento_path}.` : "Documento não anexado.",
          row.comprovante_path ? `Comprovante: ${row.comprovante_path}.` : "Comprovante pendente.",
        ]
          .filter(Boolean)
          .join(" "),
      });
      if (matriculaError) throw new Error(matriculaError.message);
      const { error: updateError } = await admin
        .from("inscricoes_digitais")
        .update({
          status: "aprovada",
          cursista_id: pessoaId,
          dados,
          revisado_por: context.userId,
          revisado_em: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (updateError) throw new Error(updateError.message);
      return { duplicada: false, cursistaId: pessoaId };
    } catch (error) {
      await admin.from("matriculas").delete().eq("cursista_id", pessoaId);
      if (cursistaCriada) await admin.from("cursistas").delete().eq("id", pessoaId);
      if (beneficiariaCriada) await admin.from("beneficiarias").delete().eq("id", pessoaId);
      throw error;
    }
  });
