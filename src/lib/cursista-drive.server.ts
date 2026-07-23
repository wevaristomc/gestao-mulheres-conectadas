/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GDriveFile } from "@/lib/gdrive-helpers.server";

type PastaDriveCursista = {
  pastaDriveId: string;
  pastaDriveUrl: string | null;
};

export type ResultadoSincronizacaoDrive = {
  sincronizados: number;
  ignorados: number;
  erros: string[];
};

type TipoAnexoDrive = "documento" | "comprovante";

type MarcadorAnexoDrive = {
  storage_path: string;
  pasta_drive_id: string;
  drive_file_id: string;
  drive_url: string | null;
  sincronizado_em: string;
};

function normalizarNomeDrive(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function nomeSeguroPasta(nome: string, fallback: string): string {
  const limpo = nome
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo || fallback;
}

function ultimosDigitosCpf(cpf: string | null | undefined): string {
  return (cpf ?? "").replace(/\D/g, "").slice(-4);
}

async function ensureChildFolder(params: {
  parentId: string;
  name: string;
  childrenCache: Map<string, GDriveFile[]>;
}): Promise<GDriveFile> {
  const h = await import("@/lib/gdrive-helpers.server");
  let children = params.childrenCache.get(params.parentId);
  if (!children) {
    const page = await h.listChildren({ folderId: params.parentId, onlyFolders: true });
    children = page.files ?? [];
    params.childrenCache.set(params.parentId, children);
  }

  let folder = children.find(
    (item) => normalizarNomeDrive(item.name) === normalizarNomeDrive(params.name),
  );
  if (!folder) {
    folder = await h.createFolder(params.name, params.parentId);
    children.push(folder);
  }
  return folder;
}

async function ensurePastaPaiCursistas(rootId: string): Promise<GDriveFile> {
  const childrenCache = new Map<string, GDriveFile[]>();
  const segundoCiclo = await ensureChildFolder({
    parentId: rootId,
    name: "Segundo Ciclo",
    childrenCache,
  });
  return ensureChildFolder({
    parentId: segundoCiclo.id,
    name: "Cursistas",
    childrenCache,
  });
}

function referenciaStorage(
  valor: string | null | undefined,
): { bucket: string; path: string } | null {
  const texto = (valor ?? "").trim();
  if (!texto) return null;
  const [bucket, ...resto] = texto.includes(":") ? texto.split(":") : ["evidencias", texto];
  const path = resto.join(":").replace(/^\/+/, "");
  if (!path || bucket !== "evidencias") return null;
  return { bucket, path };
}

function bytesParaBase64(bytes: Uint8Array): string {
  let binario = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binario += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binario);
}

function extensaoArquivo(path: string, mime: string): string {
  const ext = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (ext) return ext;
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "bin";
}

function nomeArquivoAnexo(
  tipo: TipoAnexoDrive,
  nomeCursista: string,
  path: string,
  mime: string,
): string {
  const base = tipo === "documento" ? "Documento pessoal" : "Comprovante de endereço";
  const nome = nomeSeguroPasta(nomeCursista, "Cursista");
  return `${base} - ${nome}.${extensaoArquivo(path, mime)}`;
}

async function baixarStorageBase64(
  admin: any,
  storageRef: string,
): Promise<{
  base64: string;
  mimeType: string;
  path: string;
}> {
  const ref = referenciaStorage(storageRef);
  if (!ref) throw new Error(`Referência de storage inválida: ${storageRef}`);
  const { data, error } = await admin.storage.from(ref.bucket).download(ref.path);
  if (error || !data)
    throw new Error(`Falha ao baixar anexo ${ref.path}: ${error?.message ?? "sem dados"}`);
  const arrayBuffer = await data.arrayBuffer();
  const mimeType = data.type || "application/pdf";
  return {
    base64: bytesParaBase64(new Uint8Array(arrayBuffer)),
    mimeType,
    path: ref.path,
  };
}

async function sincronizarArquivoAnexoDrive(params: {
  admin: any;
  pastaDriveId: string;
  nomeCursista: string;
  tipo: TipoAnexoDrive;
  storageRef: string;
}): Promise<GDriveFile> {
  const h = await import("@/lib/gdrive-helpers.server");
  const baixado = await baixarStorageBase64(params.admin, params.storageRef);
  const nome = nomeArquivoAnexo(params.tipo, params.nomeCursista, baixado.path, baixado.mimeType);
  const filhos = await h.listChildren({ folderId: params.pastaDriveId, onlyFolders: false });
  const existente = (filhos.files ?? []).find(
    (file) =>
      file.mimeType !== h.FOLDER_MIME &&
      normalizarNomeDrive(file.name) === normalizarNomeDrive(nome),
  );

  if (existente) {
    return h.updateFile({
      fileId: existente.id,
      name: nome,
      mimeType: baixado.mimeType,
      base64: baixado.base64,
    });
  }

  return h.uploadFile({
    name: nome,
    mimeType: baixado.mimeType,
    base64: baixado.base64,
    parentId: params.pastaDriveId,
  });
}

export async function criarOuGarantirPastaDriveCursista(params: {
  admin: any;
  cursistaId: string;
  nome: string;
  cpf?: string | null;
}): Promise<PastaDriveCursista> {
  const h = await import("@/lib/gdrive-helpers.server");
  const rootId = h.getRootFolderId();
  if (!rootId) throw new Error("GDRIVE_ROOT_FOLDER_ID não configurado.");

  const pastaPai = await ensurePastaPaiCursistas(rootId);
  const nomeBase = nomeSeguroPasta(params.nome, `Cursista ${params.cursistaId.slice(0, 8)}`);
  const filhos = await h.listChildren({ folderId: pastaPai.id, onlyFolders: true });
  const nomeNormalizado = normalizarNomeDrive(nomeBase);
  const homonima = (filhos.files ?? []).find(
    (item) => normalizarNomeDrive(item.name) === nomeNormalizado,
  );
  const sufixoCpf = ultimosDigitosCpf(params.cpf) || params.cursistaId.slice(0, 4);
  const nomePasta = homonima ? `${nomeBase} - ${sufixoCpf}` : nomeBase;
  const pastaExistente = (filhos.files ?? []).find(
    (item) => normalizarNomeDrive(item.name) === normalizarNomeDrive(nomePasta),
  );
  const pasta = pastaExistente ?? (await h.createFolder(nomePasta, pastaPai.id));

  const { data: atualizada, error } = await params.admin
    .from("cursistas")
    .update({
      pasta_drive_id: pasta.id,
      pasta_drive_url: pasta.webViewLink ?? null,
    })
    .eq("id", params.cursistaId)
    .select("pasta_drive_id, pasta_drive_url")
    .maybeSingle();
  if (error) throw new Error(`Falha ao registrar pasta da cursista: ${error.message}`);

  return {
    pastaDriveId: (atualizada?.pasta_drive_id as string | null) ?? pasta.id,
    pastaDriveUrl: (atualizada?.pasta_drive_url as string | null) ?? pasta.webViewLink ?? null,
  };
}

function marcadorSincronizado(
  marcador: MarcadorAnexoDrive | null | undefined,
  storagePath: string,
  pastaDriveId: string,
): boolean {
  return !!(
    marcador?.storage_path === storagePath &&
    marcador?.pasta_drive_id === pastaDriveId &&
    marcador?.drive_file_id
  );
}

export async function sincronizarDocumentosInscricaoNoDrive(params: {
  admin: any;
  inscricaoId: string;
  cursistaId?: string | null;
  pastaDriveId?: string | null;
  nome?: string | null;
  force?: boolean;
}): Promise<ResultadoSincronizacaoDrive> {
  const resultado: ResultadoSincronizacaoDrive = { sincronizados: 0, ignorados: 0, erros: [] };
  const { data: inscricao, error: inscricaoError } = await params.admin
    .from("inscricoes_digitais")
    .select("id, dados, documento_path, comprovante_path, cursista_id")
    .eq("id", params.inscricaoId)
    .maybeSingle();
  if (inscricaoError || !inscricao) {
    throw new Error(
      inscricaoError?.message ?? "Inscrição não encontrada para sincronizar documentos.",
    );
  }

  const cursistaId = params.cursistaId ?? (inscricao.cursista_id as string | null);
  if (!cursistaId) return resultado;

  const { data: cursista, error: cursistaError } = await params.admin
    .from("cursistas")
    .select("id, nome, cpf, pasta_drive_id, pasta_drive_url")
    .eq("id", cursistaId)
    .maybeSingle();
  if (cursistaError || !cursista) {
    throw new Error(
      cursistaError?.message ?? "Cursista não encontrada para sincronizar documentos.",
    );
  }

  let pastaDriveId = params.pastaDriveId ?? (cursista.pasta_drive_id as string | null);
  if (!pastaDriveId) {
    const pasta = await criarOuGarantirPastaDriveCursista({
      admin: params.admin,
      cursistaId,
      nome: (cursista.nome as string | null) ?? params.nome ?? "Cursista",
      cpf: cursista.cpf as string | null,
    });
    pastaDriveId = pasta.pastaDriveId;
  }

  const dados = (inscricao.dados ?? {}) as Record<string, any>;
  const sincronizadosAnteriores = {
    ...((dados.drive_documentos_sincronizados ?? {}) as Record<string, MarcadorAnexoDrive>),
  };
  const proximo = { ...sincronizadosAnteriores };
  let mudou = false;
  const anexos: Array<{ tipo: TipoAnexoDrive; storagePath: string | null }> = [
    { tipo: "documento", storagePath: (inscricao.documento_path as string | null) ?? null },
    { tipo: "comprovante", storagePath: (inscricao.comprovante_path as string | null) ?? null },
  ];

  for (const anexo of anexos) {
    if (!anexo.storagePath) continue;
    if (
      !params.force &&
      marcadorSincronizado(proximo[anexo.tipo], anexo.storagePath, pastaDriveId)
    ) {
      resultado.ignorados += 1;
      continue;
    }
    try {
      const driveFile = await sincronizarArquivoAnexoDrive({
        admin: params.admin,
        pastaDriveId,
        nomeCursista: params.nome ?? (cursista.nome as string | null) ?? "Cursista",
        tipo: anexo.tipo,
        storageRef: anexo.storagePath,
      });
      proximo[anexo.tipo] = {
        storage_path: anexo.storagePath,
        pasta_drive_id: pastaDriveId,
        drive_file_id: driveFile.id,
        drive_url: driveFile.webViewLink ?? null,
        sincronizado_em: new Date().toISOString(),
      };
      resultado.sincronizados += 1;
      mudou = true;
    } catch (error) {
      resultado.erros.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (mudou) {
    const { error } = await params.admin
      .from("inscricoes_digitais")
      .update({ dados: { ...dados, drive_documentos_sincronizados: proximo } })
      .eq("id", params.inscricaoId);
    if (error) resultado.erros.push(`Falha ao registrar sincronização: ${error.message}`);
  }

  return resultado;
}

export async function sincronizarDocumentosCursistaNoDrive(params: {
  admin: any;
  cursistaId: string;
  force?: boolean;
}): Promise<PastaDriveCursista & ResultadoSincronizacaoDrive> {
  const { data: cursista, error: cursistaError } = await params.admin
    .from("cursistas")
    .select("id, nome, cpf, pasta_drive_id, pasta_drive_url")
    .eq("id", params.cursistaId)
    .maybeSingle();
  if (cursistaError || !cursista) {
    throw new Error(cursistaError?.message ?? "Cursista não encontrada.");
  }

  let pasta: PastaDriveCursista = {
    pastaDriveId: (cursista.pasta_drive_id as string | null) ?? "",
    pastaDriveUrl: (cursista.pasta_drive_url as string | null) ?? null,
  };
  if (!pasta.pastaDriveId) {
    pasta = await criarOuGarantirPastaDriveCursista({
      admin: params.admin,
      cursistaId: params.cursistaId,
      nome: (cursista.nome as string | null) ?? "Cursista",
      cpf: cursista.cpf as string | null,
    });
  }

  const { data: inscricao, error: inscricaoError } = await params.admin
    .from("inscricoes_digitais")
    .select("id")
    .eq("cursista_id", params.cursistaId)
    .order("revisado_em", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (inscricaoError) throw new Error(inscricaoError.message);
  if (!inscricao) return { ...pasta, sincronizados: 0, ignorados: 0, erros: [] };

  const sync = await sincronizarDocumentosInscricaoNoDrive({
    admin: params.admin,
    inscricaoId: inscricao.id as string,
    cursistaId: params.cursistaId,
    pastaDriveId: pasta.pastaDriveId,
    nome: (cursista.nome as string | null) ?? "Cursista",
    force: params.force,
  });
  return { ...pasta, ...sync };
}
