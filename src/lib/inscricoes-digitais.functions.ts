/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { formatCpf, isValidCpf, onlyDigits } from "@/lib/cpf";
import {
  DADOS_INSCRICAO_VAZIOS,
  dadosInscricaoDigitalSchema,
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
    idade: (() => {
      const raw = fonte.idade;
      if (raw == null || raw === "") return null;
      const n = typeof raw === "number" ? raw : parseInt(String(raw).replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
    })(),
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
    let cursistasRes = formatos.length
      ? await admin
          .from("cursistas")
          .select("id, nome, cpf, pasta_drive_id, pasta_drive_url")
          .in("cpf", formatos)
      : { data: [], error: null };
    if (
      cursistasRes.error &&
      /pasta_drive_id|pasta_drive_url|schema cache|does not exist/i.test(cursistasRes.error.message)
    ) {
      cursistasRes = await admin.from("cursistas").select("id, nome, cpf").in("cpf", formatos);
    }
    const beneficiariasRes = formatos.length
      ? await admin.from("beneficiarias").select("id, nome, cpf").in("cpf", formatos)
      : { data: [], error: null };
    if (cursistasRes.error) throw new Error(cursistasRes.error.message);
    if (beneficiariasRes.error) throw new Error(beneficiariasRes.error.message);
    const existentes = [...(cursistasRes.data ?? []), ...(beneficiariasRes.data ?? [])] as any[];
    const porCpf = new Map<string, any>();
    for (const existente of existentes) porCpf.set(onlyDigits(existente.cpf ?? ""), existente);

    return Promise.all(
      ((rows ?? []) as any[]).map(async (row): Promise<InscricaoDigitalRow> => {
        const cpf = onlyDigits(texto(row.dados?.cpf));
        const duplicada = porCpf.get(cpf);
        const driveSync = (row.dados?.drive_documentos_sincronizados ?? {}) as any;
        const documentoDriveOk =
          !row.documento_path ||
          (driveSync.documento?.storage_path === row.documento_path &&
            driveSync.documento?.drive_file_id &&
            driveSync.documento?.pasta_drive_id === duplicada?.pasta_drive_id);
        const comprovanteDriveOk =
          !row.comprovante_path ||
          (driveSync.comprovante?.storage_path === row.comprovante_path &&
            driveSync.comprovante?.drive_file_id &&
            driveSync.comprovante?.pasta_drive_id === duplicada?.pasta_drive_id);
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
          pastaDriveId: duplicada?.pasta_drive_id ?? null,
          pastaDriveUrl: duplicada?.pasta_drive_url ?? null,
          documentosDriveSincronizados: Boolean(
            (row.documento_path || row.comprovante_path) && documentoDriveOk && comprovanteDriveOk,
          ),
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
  "importar" | "duplicada" | "nao_elegivel" | "sem_autorizacao" | "erro";

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

function formatarDataForms(valor: string): string {
  const v = valor.trim();
  if (!v) return "";
  const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (!m) return v;
  const ano = m[3].length === 2 ? "20" + m[3] : m[3];
  return m[1].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + ano + (m[4] ? " " + m[4] : "");
}

function dadosGoogleForms(
  row: Record<string, string>,
  municipiosOficiais: string[],
): DadosInscricaoDigitalNormalizados {
  const carimbo = valorColuna(row, ["carimbo de data hora", "timestamp", "data hora"]);
  const idade = valorColuna(row, ["idade"]);
  const idadeNumero = (() => {
    if (!idade) return null;
    const n = parseInt(String(idade).replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
  })();
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
    nome: valorColuna(row, ["nome completo", "nome"]),
    idade: idadeNumero,
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
    autorizacao_dados_em: carimbo || new Date().toISOString(),
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

async function prepararPreviewGoogleForms(
  admin: any,
  projetoId: string,
  arquivo: ArquivoPlanilhaGoogleForms,
): Promise<ResultadoPreviewGoogleForms & { dadosImportar: DadosInscricaoDigitalNormalizados[] }> {
  const [turmasRes, inscricoesRes] = await Promise.all([
    admin.from("turmas").select("municipio").eq("projeto_id", projetoId).limit(500),
    admin.from("inscricoes_digitais").select("dados").eq("projeto_id", projetoId).limit(5000),
  ]);
  if (turmasRes.error) throw new Error(turmasRes.error.message);
  if (inscricoesRes.error) throw new Error(inscricoesRes.error.message);
  const municipiosOficiais: string[] = Array.from(
    new Set((turmasRes.data ?? []).map((t: any) => texto(t.municipio)).filter(Boolean)),
  );
  const telefonesExistentes = new Set<string>();
  const nomesMunicipiosExistentes = new Set<string>();
  for (const row of (inscricoesRes.data ?? []) as any[]) {
    const dados = normalizarDadosOcr(row.dados, row.dados?.confiancas);
    const telefone = onlyDigits(dados.telefone);
    if (telefone) telefonesExistentes.add(telefone);
    if (dados.nome && dados.municipio) nomesMunicipiosExistentes.add(chaveNomeMunicipio(dados));
  }
  const telefonesArquivo = new Set<string>();
  const nomesArquivo = new Set<string>();
  const rows = await lerPlanilhaGoogleForms(arquivo);
  const resumo = {
    total: rows.length,
    importar: 0,
    duplicada: 0,
    nao_elegivel: 0,
    sem_autorizacao: 0,
    erro: 0,
    fora_area: 0,
    menor_idade: 0,
  } satisfies ResumoPreviewGoogleForms;
  const linhas: LinhaPreviewGoogleForms[] = [];
  const dadosImportar: DadosInscricaoDigitalNormalizados[] = [];
  rows.forEach((row, index) => {
    try {
      const dados = dadosGoogleForms(row, municipiosOficiais);
      const municipioEmArea = municipiosOficiais.some(
        (municipio) =>
          normalizarTextoComparacao(municipio) === normalizarTextoComparacao(dados.municipio),
      );
      const foraArea = !!dados.municipio && !municipioEmArea;
      const idadeInformada = idadeInformadaGoogleForms(dados.observacoes);
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
        const duplicadaTelefone =
          telefone && (telefonesExistentes.has(telefone) || telefonesArquivo.has(telefone));
        const duplicadaNome =
          !telefone &&
          dados.nome &&
          dados.municipio &&
          (nomesMunicipiosExistentes.has(chaveNome) || nomesArquivo.has(chaveNome));
        if (duplicadaTelefone || duplicadaNome) {
          status = "duplicada";
          motivo = duplicadaTelefone
            ? "Telefone já importado/cadastrado"
            : "Nome e município já importados/cadastrados";
        }
      }
      if (status === "importar") {
        const telefone = onlyDigits(dados.telefone);
        if (telefone) telefonesArquivo.add(telefone);
        if (dados.nome && dados.municipio) nomesArquivo.add(chaveNomeMunicipio(dados));
        dadosImportar.push(dados);
      }
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
  return { resumo, linhas, dadosImportar };
}

export const previewImportacaoGoogleForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z.object({ projetoId: UUID, arquivo: ArquivoGoogleFormsSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<ResultadoPreviewGoogleForms> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const preview = await prepararPreviewGoogleForms(admin, data.projetoId, data.arquivo);
    return { resumo: preview.resumo, linhas: preview.linhas };
  });

export const confirmarImportacaoGoogleForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) =>
    z.object({ projetoId: UUID, arquivo: ArquivoGoogleFormsSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<ResultadoPreviewGoogleForms> => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = getSupabaseAdmin();
    const preview = await prepararPreviewGoogleForms(admin, data.projetoId, data.arquivo);
    for (const dados of preview.dadosImportar) {
      try {
        const { error } = await admin.from("inscricoes_digitais").insert({
          projeto_id: data.projetoId,
          turma_id: null,
          origem: "google_forms",
          status: "pendente",
          dados,
        });
        if (error) throw new Error(error.message);
      } catch (error) {
        preview.resumo.importar -= 1;
        preview.resumo.erro += 1;
        preview.linhas.push({
          linha: 0,
          nome: dados.nome,
          email: dados.email,
          telefone: dados.telefone,
          idadeInformada: idadeInformadaGoogleForms(dados.observacoes)?.toString() ?? "",
          municipio: dados.municipio,
          bairroReferencia: dados.bairro_referencia,
          turnoPreferido: dados.turno_preferido,
          autorizacaoDados: dados.autorizacao_dados,
          status: "erro",
          motivo: error instanceof Error ? error.message : String(error),
          foraArea: false,
          menorIdade: false,
        });
      }
    }
    return { resumo: preview.resumo, linhas: preview.linhas };
  });

function turnoRelatorio(valor: string): string {
  return valor || "Não informado";
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
    "cpf": "", "data_nascimento": "AAAA-MM-DD ou vazio",
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
Inclua em "confiancas" todos os campos retornados, inclusive nome_social, os campos dos dois contatos,
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
      .select("id, dados, documento_path, comprovante_path, cursista_id, status")
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
      .select("id, dados, documento_path, comprovante_path, cursista_id, status")
      .single();
    if (updateError) throw new Error(updateError.message);

    if (atualizado.status === "aprovada" && atualizado.cursista_id) {
      try {
        const { sincronizarDocumentosInscricaoNoDrive } =
          await import("@/lib/cursista-drive.server");
        const resultadoDrive = await sincronizarDocumentosInscricaoNoDrive({
          admin,
          inscricaoId: data.id,
          cursistaId: atualizado.cursista_id as string,
        });
        if (resultadoDrive.erros.length) {
          console.warn(
            "[inscricoes] Falha parcial ao sincronizar anexos no Drive",
            resultadoDrive.erros,
          );
        }
      } catch (driveError) {
        console.warn("[inscricoes] Não foi possível sincronizar anexos no Drive", driveError);
      }
    }

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
    let pastaDriveId: string | null = null;
    let pastaDriveUrl: string | null = null;
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
      try {
        const { criarOuGarantirPastaDriveCursista } = await import("@/lib/cursista-drive.server");
        const pastaDrive = await criarOuGarantirPastaDriveCursista({
          admin,
          cursistaId: pessoaId,
          nome: dados.nome,
          cpf: dados.cpf,
        });
        pastaDriveId = pastaDrive.pastaDriveId;
        pastaDriveUrl = pastaDrive.pastaDriveUrl;
      } catch (driveError) {
        console.warn(
          "[inscricoes] Não foi possível criar a pasta da cursista no Drive",
          driveError,
        );
      }
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
      try {
        const { sincronizarDocumentosInscricaoNoDrive } =
          await import("@/lib/cursista-drive.server");
        const resultadoDrive = await sincronizarDocumentosInscricaoNoDrive({
          admin,
          inscricaoId: data.id,
          cursistaId: pessoaId,
          pastaDriveId,
          nome: dados.nome,
        });
        if (resultadoDrive.erros.length) {
          console.warn(
            "[inscricoes] Falha parcial ao sincronizar anexos no Drive",
            resultadoDrive.erros,
          );
        }
      } catch (driveError) {
        console.warn("[inscricoes] Não foi possível sincronizar anexos no Drive", driveError);
      }
      return { duplicada: false, cursistaId: pessoaId, pastaDriveId, pastaDriveUrl };
    } catch (error) {
      await admin.from("matriculas").delete().eq("cursista_id", pessoaId);
      if (cursistaCriada) await admin.from("cursistas").delete().eq("id", pessoaId);
      if (beneficiariaCriada) await admin.from("beneficiarias").delete().eq("id", pessoaId);
      throw error;
    }
  });
