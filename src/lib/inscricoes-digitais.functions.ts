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
  return {
    ...DADOS_INSCRICAO_VAZIOS,
    nome: texto(fonte.nome),
    cpf: onlyDigits(texto(fonte.cpf)),
    data_nascimento: texto(fonte.data_nascimento),
    genero: texto(fonte.genero),
    raca: texto(fonte.raca),
    pcd: booleano(fonte.pcd),
    tipo_deficiencia: texto(fonte.tipo_deficiencia),
    telefone: texto(fonte.telefone),
    email: texto(fonte.email),
    endereco: texto(fonte.endereco),
    municipio: texto(fonte.municipio),
    bairro_referencia: texto(fonte.bairro_referencia),
    turno_preferido: turnoPreferido(fonte.turno_preferido),
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
      nome:
        turma.nome_curso ?? turma.curso ?? turma.codigo_turma ?? turma.codigo ?? "Turma sem nome",
      codigo: turma.codigo ?? turma.codigo_turma ?? null,
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

export const criarInscricaoFormulario = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        dados: dadosInscricaoDigitalSchema,
        aceiteFisico: z.literal(true),
        website: z.string().max(0).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
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
    const { data: inscricao, error } = await admin
      .from("inscricoes_digitais")
      .insert({
        projeto_id: projeto.id,
        turma_id: null,
        origem: "formulario",
        status: "pendente",
        dados: data.dados,
      })
      .select("id, criado_em")
      .single();
    if (error) {
      if (/inscricoes_digitais|schema cache|does not exist/i.test(error.message)) {
        throw new Error("A migração de matrícula digital ainda não foi aplicada no Supabase.");
      }
      throw new Error(error.message);
    }
    return { id: inscricao.id as string, criadoEm: inscricao.criado_em as string };
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
    "nome": "", "cpf": "", "data_nascimento": "AAAA-MM-DD ou vazio",
    "genero": "", "raca": "", "pcd": false, "tipo_deficiencia": "",
    "telefone": "", "email": "", "endereco": "", "municipio": "",
    "bairro_referencia": "", "turno_preferido": "",
    "nis": "", "beneficiaria_programa_social": false,
    "qual_programa_social": "", "banco": "", "agencia": "", "conta": "",
    "observacoes": ""
  },
  "confiancas": { "nome": 0.0, "cpf": 0.0 },
  "confianca_geral": 0.0
}
Em "turno_preferido", use somente "manha", "tarde", "noite", "qualquer" ou vazio.
Inclua em "confiancas" todos os campos retornados, inclusive turno_preferido e bairro_referencia, usando valores entre 0 e 1.
Campos ausentes ou ilegíveis devem ser string vazia e confiança 0.`;
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
        observacao_importacao: `Inscrição digital ${row.id} (${row.origem}).`,
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
