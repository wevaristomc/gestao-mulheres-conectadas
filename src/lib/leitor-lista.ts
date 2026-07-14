import { supabase } from "@/integrations/supabase/client";

// -----------------------------------------------------------------------------
// Helpers de cliente para o leitor de listas de presença digitalizadas.
// Converte PDF/imagem em PNGs base64, cruza com matrículas e persiste no banco.
// -----------------------------------------------------------------------------

export type AlunaExtraida = {
  num: number | null;
  nome: string | null;
  cpf: string | null;
  frequencia_sim: boolean;
  lanche_sim: boolean;
  assinatura_presente: boolean;
  legivel: boolean;
};

export type CabecalhoExtraido = {
  turma?: string | null;
  data?: string | null;
  conteudo?: string | null;
  instrutor?: string | null;
  horario?: string | null;
  ch_dia?: number | null;
  endereco?: string | null;
};

export type ResultadoLeitura = {
  cabecalho: CabecalhoExtraido;
  alunas: AlunaExtraida[];
  observacoes: string[];
  provedor: string;
  modelo: string;
  tokens: number;
};

export type MatriculaLite = {
  matricula_id: string;
  beneficiaria_id: string;
  nome: string;
  cpf: string;
  status: string | null;
};

export type StatusCruzamento = "identificada" | "divergencia" | "nao_identificada";

export type LinhaConferencia = AlunaExtraida & {
  matricula_id: string | null;
  beneficiaria_id: string | null;
  nome_matriculado: string | null;
  status: StatusCruzamento;
  motivo?: string;
  presente: boolean; // valor final que será gravado
};

// ---------------- PDF/imagem -> PNG base64 ----------------

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function dataUrlToBase64(url: string): string {
  const i = url.indexOf(",");
  return i >= 0 ? url.slice(i + 1) : url;
}

async function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  const url = canvas.toDataURL("image/png");
  return dataUrlToBase64(url);
}

export async function arquivoParaImagensBase64(file: File): Promise<{ mime: string; base64: string }[]> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || ext === "pdf";
  if (!isPdf) {
    const url = await fileToDataUrl(file);
    const mime = file.type || "image/png";
    return [{ mime, base64: dataUrlToBase64(url) }];
  }

  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  // Worker via URL para o Vite empacotar corretamente.
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const imagens: { mime: string; base64: string }[] = [];
  const MAX = Math.min(doc.numPages, 6);
  for (let i = 1; i <= MAX; i += 1) {
    const page = await doc.getPage(i);
    // ~2x resolução para OCR
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    imagens.push({ mime: "image/png", base64: await canvasToPngBase64(canvas) });
  }
  return imagens;
}

// ---------------- Cruzamento com matrículas ----------------

function normalizeNome(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarNome(a: string, b: string): number {
  const A = normalizeNome(a).split(" ").filter(Boolean);
  const B = new Set(normalizeNome(b).split(" ").filter(Boolean));
  if (!A.length || !B.size) return 0;
  let hits = 0;
  for (const p of A) if (B.has(p)) hits += 1;
  return hits / Math.max(A.length, B.size);
}

export async function carregarMatriculasDaTurma(turmaId: string): Promise<MatriculaLite[]> {
  const { data, error } = await supabase
    .from("matriculas")
    .select("id, status, beneficiaria:beneficiarias(id, nome, cpf)")
    .eq("turma_id", turmaId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  return rows
    .filter((r) => {
      const status = String(r.status ?? "").toLowerCase();
      return r.beneficiaria && status !== "evadida" && status !== "desistente";
    })
    .map((r) => ({
      matricula_id: r.id,
      beneficiaria_id: r.beneficiaria.id,
      nome: r.beneficiaria.nome ?? "",
      cpf: onlyDigits(String(r.beneficiaria.cpf ?? "")),
      status: r.status ?? null,
    }));
}

export function cruzarComMatriculas(
  alunas: AlunaExtraida[],
  matriculas: MatriculaLite[],
): LinhaConferencia[] {
  const porCpf = new Map<string, MatriculaLite>();
  for (const m of matriculas) if (m.cpf) porCpf.set(m.cpf, m);
  const linhas: LinhaConferencia[] = [];
  for (const a of alunas) {
    const presenteMarcado = !!(a.frequencia_sim || a.assinatura_presente);
    let status: StatusCruzamento = "nao_identificada";
    let motivo: string | undefined;
    let match: MatriculaLite | null = null;

    if (a.cpf && porCpf.has(a.cpf)) {
      match = porCpf.get(a.cpf)!;
      const sim = a.nome ? similarNome(a.nome, match.nome) : 1;
      status = sim >= 0.4 ? "identificada" : "divergencia";
      if (status === "divergencia") motivo = `Nome diverge do CPF cadastrado (${match.nome})`;
    } else if (a.nome) {
      let melhor: { m: MatriculaLite; s: number } | null = null;
      for (const m of matriculas) {
        const s = similarNome(a.nome, m.nome);
        if (!melhor || s > melhor.s) melhor = { m, s };
      }
      if (melhor && melhor.s >= 0.6) {
        match = melhor.m;
        status = a.cpf ? "divergencia" : "identificada";
        if (a.cpf) motivo = "CPF lido não bate com cadastro";
      } else {
        motivo = a.cpf ? "CPF não encontrado e nome sem correspondência" : "Nome sem correspondência na turma";
      }
    } else {
      motivo = "Linha ilegível";
    }

    linhas.push({
      ...a,
      matricula_id: match?.matricula_id ?? null,
      beneficiaria_id: match?.beneficiaria_id ?? null,
      nome_matriculado: match?.nome ?? null,
      status,
      motivo,
      presente: presenteMarcado,
    });
  }
  return linhas;
}

// ---------------- Upload do arquivo original ----------------

export async function uploadArquivoLista(turmaId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `turmas/${turmaId}/listas-presenca/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const up = await supabase.storage.from("evidencias").upload(path, file, {
    upsert: false,
    contentType: file.type || `application/${ext}`,
  });
  if (up.error) throw new Error(up.error.message);
  const pub = supabase.storage.from("evidencias").getPublicUrl(path);
  return { url: pub.data.publicUrl, path };
}

// ---------------- Persistência final ----------------

export type ConfirmarInput = {
  turmaId: string;
  arquivoUrl: string;
  arquivoNome: string;
  cabecalho: CabecalhoExtraido;
  linhas: LinhaConferencia[];
  observacoes: string[];
  codigoTurma: string | null;
  nomeCurso: string | null;
};

export type ConfirmarResultado = {
  aula_id: string;
  presencas_registradas: number;
  lanches_registrados: number;
  evidencia_id: string | null;
  importacao_id: string;
  nao_identificadas: LinhaConferencia[];
};

function normalizarHora(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})(?:[:hH](\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function extrairHorario(raw: string | null | undefined): { inicio: string | null; fim: string | null } {
  const s = String(raw ?? "").trim();
  if (!s) return { inicio: null, fim: null };
  const m = s.match(/(\d{1,2})(?:[:hH](\d{2}))?\s*(?:às|as|-|–|—|a|até)\s*(\d{1,2})(?:[:hH](\d{2}))?/i);
  if (m) {
    return {
      inicio: normalizarHora(`${m[1]}:${m[2] ?? "00"}`),
      fim: normalizarHora(`${m[3]}:${m[4] ?? "00"}`),
    };
  }
  return { inicio: normalizarHora(s), fim: null };
}

function horaDaAula(row: Record<string, unknown>, key: "hora_inicio" | "hora_fim"): string | null {
  return normalizarHora(typeof row[key] === "string" ? row[key] : null);
}

async function upsertAula(turmaId: string, cab: CabecalhoExtraido): Promise<string> {
  if (!cab.data) throw new Error("A IA não identificou a data da aula — corrija no cabeçalho antes de gravar.");
  const dataIso = cab.data;
  const horario = extrairHorario(cab.horario);
  // Em dias com mais de uma aula, a data sozinha aponta para a aula errada.
  // Usa horário quando disponível e só aceita fallback por data quando há uma única aula no dia.
  const existentes = await supabase
    .from("aulas")
    .select("id, hora_inicio, hora_fim")
    .eq("turma_id", turmaId)
    .eq("data", dataIso)
    .order("hora_inicio", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (existentes.error) throw new Error("Falha ao localizar aula existente: " + existentes.error.message);
  const aulasDoDia = (existentes.data ?? []) as Array<Record<string, unknown> & { id: string }>;

  let aulaExistente = horario.inicio
    ? aulasDoDia.find((a) => {
        const hi = horaDaAula(a, "hora_inicio");
        const hf = horaDaAula(a, "hora_fim");
        return hi === horario.inicio && (!horario.fim || !hf || hf === horario.fim);
      }) ?? null
    : null;

  if (!aulaExistente && aulasDoDia.length === 1) {
    aulaExistente = aulasDoDia[0];
  }

  if (!aulaExistente && aulasDoDia.length > 1) {
    const detalhes = aulasDoDia
      .map((a) => [horaDaAula(a, "hora_inicio") ?? "sem início", horaDaAula(a, "hora_fim") ?? "sem fim"].join("–"))
      .join(", ");
    throw new Error(
      `Há mais de uma aula em ${dataIso}. Informe/corrija o horário da lista para gravar na aula correta (${detalhes}).`,
    );
  }

  const payload: Record<string, unknown> = {
    turma_id: turmaId,
    data: dataIso,
    conteudo_programatico: cab.conteudo ?? null,
    instrutor: cab.instrutor ?? null,
    ch_ministrada: cab.ch_dia ?? null,
  };
  if (horario.inicio) payload.hora_inicio = horario.inicio;
  if (horario.fim) payload.hora_fim = horario.fim;
  if (aulaExistente?.id) {
    const up = await supabase.from("aulas").update(payload).eq("id", aulaExistente.id);
    if (up.error) throw new Error("Falha ao atualizar aula: " + up.error.message);
    return aulaExistente.id;
  }
  const ins = await supabase.from("aulas").insert(payload).select("id").single();
  if (ins.error) throw new Error("Falha ao criar aula: " + ins.error.message);
  return (ins.data as any).id as string;
}

function padraoNomeEvidencia(codigoTurma: string | null, curso: string | null, data: string, tipo: string) {
  const safe = (s: string | null | undefined) =>
    String(s ?? "SC").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_").toUpperCase();
  const mes = data.slice(0, 7);
  return `${safe(codigoTurma)}_${safe(curso)}_${mes}_${tipo.toUpperCase()}.pdf`;
}

export async function confirmarImportacao(input: ConfirmarInput): Promise<ConfirmarResultado> {
  const aulaId = await upsertAula(input.turmaId, input.cabecalho);

  // matriculas da turma para marcar ausentes
  const matriculas = await carregarMatriculasDaTurma(input.turmaId);

  const linhasIdentificadas = input.linhas.filter((l) => l.matricula_id);
  const idsPresentes = new Set(linhasIdentificadas.filter((l) => l.presente).map((l) => l.matricula_id!));
  const idsLidos = new Set(linhasIdentificadas.map((l) => l.matricula_id!));

  // Presencas: presentes primeiro, ausentes depois (para todas matriculadas)
  const presencasPayload: any[] = [];
  for (const m of matriculas) {
    const presente = idsPresentes.has(m.matricula_id);
    presencasPayload.push({
      aula_id: aulaId,
      matricula_id: m.matricula_id,
      presente,
      justificativa: !idsLidos.has(m.matricula_id) ? "Não constava na lista escaneada" : null,
    });
  }
  if (presencasPayload.length) {
    const { error } = await supabase.from("presencas").upsert(presencasPayload, { onConflict: "aula_id,matricula_id" });
    if (error) throw new Error("Falha ao gravar presenças: " + error.message);
  }

  // Entregas de lanche (alimentacao)
  let lanches = 0;
  const lanchesPayload: any[] = [];
  for (const l of input.linhas) {
    if (l.lanche_sim && l.matricula_id) {
      lanchesPayload.push({
        turma_id: input.turmaId,
        matricula_id: l.matricula_id,
        descricao: "Lanche",
        data_entrega: input.cabecalho.data,
        status: "entregue",
      });
      lanches += 1;
    }
  }
  if (lanchesPayload.length) {
    const ins = await supabase.from("entregas_beneficios").insert(lanchesPayload);
    if (ins.error) {
      // não bloqueia, apenas anota
      console.warn("entregas_beneficios:", ins.error.message);
    }
  }

  // Evidência
  let evidenciaId: string | null = null;
  const nomePadronizado = padraoNomeEvidencia(
    input.codigoTurma,
    input.nomeCurso,
    input.cabecalho.data ?? new Date().toISOString().slice(0, 10),
    "LISTA_PRESENCA",
  );
  const evIns = await supabase.from("evidencias").insert({
    turma_id: input.turmaId,
    aula_id: aulaId,
    tipo: "lista_presenca",
    descricao: `Lista de presença importada por OCR — ${input.cabecalho.data ?? ""}`,
    arquivo_url: input.arquivoUrl,
    arquivo_nome: nomePadronizado,
  }).select("id").single();
  if (!evIns.error) evidenciaId = (evIns.data as any).id;

  const naoIdent = input.linhas.filter((l) => l.status !== "identificada");
  const impIns = await supabase.from("importacoes_presenca").insert({
    turma_id: input.turmaId,
    aula_id: aulaId,
    arquivo_url: input.arquivoUrl,
    arquivo_nome: input.arquivoNome,
    data_aula: input.cabecalho.data ?? null,
    conteudo: input.cabecalho.conteudo ?? null,
    instrutor: input.cabecalho.instrutor ?? null,
    horario: input.cabecalho.horario ?? null,
    ch_dia: input.cabecalho.ch_dia ?? null,
    turma_identificada: input.cabecalho.turma ?? null,
    itens: input.linhas,
    nao_identificados: naoIdent,
    avisos: input.observacoes,
    status: "concluida",
  }).select("id").single();
  if (impIns.error) throw new Error("Falha ao gravar importação: " + impIns.error.message);

  return {
    aula_id: aulaId,
    presencas_registradas: idsPresentes.size,
    lanches_registrados: lanches,
    evidencia_id: evidenciaId,
    importacao_id: (impIns.data as any).id,
    nao_identificadas: naoIdent,
  };
}

// ---------------- Relatório .txt de itens não cruzados ----------------

export function gerarRelatorioTxt(input: {
  cabecalho: CabecalhoExtraido;
  linhas: LinhaConferencia[];
  observacoes: string[];
}): string {
  const partes: string[] = [];
  partes.push("RELATÓRIO DE IMPORTAÇÃO DE LISTA DE PRESENÇA");
  partes.push("");
  partes.push(`Turma:      ${input.cabecalho.turma ?? "—"}`);
  partes.push(`Data:       ${input.cabecalho.data ?? "—"}`);
  partes.push(`Conteúdo:   ${input.cabecalho.conteudo ?? "—"}`);
  partes.push(`Instrutor:  ${input.cabecalho.instrutor ?? "—"}`);
  partes.push(`Horário:    ${input.cabecalho.horario ?? "—"}`);
  partes.push(`CH/dia:     ${input.cabecalho.ch_dia ?? "—"}`);
  partes.push("");
  const naoId = input.linhas.filter((l) => l.status !== "identificada");
  partes.push(`Itens não identificados / com divergência: ${naoId.length}`);
  for (const l of naoId) {
    partes.push(
      `- linha ${l.num ?? "?"} ${l.nome ?? "(nome ilegível)"} — CPF ${l.cpf ?? "ilegível"} — ${l.status} — ${l.motivo ?? ""}`,
    );
  }
  partes.push("");
  if (input.observacoes.length) {
    partes.push("Avisos da IA:");
    for (const o of input.observacoes) partes.push(`- ${o}`);
  }
  return partes.join("\n");
}

export function baixarTxt(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------- Histórico ----------------

export type ImportacaoLista = {
  id: string;
  turma_id: string | null;
  aula_id: string | null;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  data_aula: string | null;
  turma_identificada: string | null;
  itens: LinhaConferencia[];
  nao_identificados: LinhaConferencia[];
  avisos: string[];
  status: string;
  criado_em: string;
  cabecalho?: CabecalhoExtraido;
  conteudo?: string | null;
  instrutor?: string | null;
  horario?: string | null;
  ch_dia?: number | null;
  revisao_status?: "em_analise" | "verificado" | "reanalise_solicitada" | null;
  revisao_por?: string | null;
  revisao_em?: string | null;
  revisao_observacao?: string | null;
};

export async function listarImportacoes(turmaId: string | null): Promise<ImportacaoLista[]> {
  let q = supabase.from("importacoes_presenca").select("*").order("criado_em", { ascending: false }).limit(100);
  if (turmaId) q = q.eq("turma_id", turmaId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as any as ImportacaoLista[];
}

// ---------------- Sugestão de turma: endereço + professor ----------------

export async function atualizarEnderecoTurma(turmaId: string, endereco: string): Promise<void> {
  const { error } = await supabase
    .from("turmas")
    .update({ local_endereco: endereco })
    .eq("id", turmaId);
  if (error) throw new Error("Falha ao atualizar endereço da turma: " + error.message);
}

export async function atualizarProfessorTurma(turmaId: string, nome: string): Promise<void> {
  const { error } = await supabase
    .from("turmas")
    .update({ professor_nome: nome })
    .eq("id", turmaId);
  if (error) throw new Error("Falha ao atualizar professor da turma: " + error.message);
}

// ---------------- Revisão do PDF importado ----------------

export type RevisaoStatus = "em_analise" | "verificado" | "reanalise_solicitada";

export async function marcarRevisaoImportacao(
  importacaoId: string,
  status: RevisaoStatus,
  observacao?: string | null,
): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess?.user?.id ?? null;
  const payload: Record<string, unknown> = {
    revisao_status: status,
    revisao_em: status === "em_analise" ? null : new Date().toISOString(),
    revisao_por: status === "em_analise" ? null : uid,
    revisao_observacao: status === "reanalise_solicitada" ? (observacao ?? null) : null,
  };
  const { error } = await supabase
    .from("importacoes_presenca")
    .update(payload)
    .eq("id", importacaoId);
  if (error) throw new Error("Falha ao atualizar revisão: " + error.message);
}