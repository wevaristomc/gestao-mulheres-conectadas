import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Todas as queries retornam { data, error } no mesmo padrão de dashboard-queries.ts.
// O schema é descoberto em runtime — colunas ausentes viram "—" na UI.

export type Row = Record<string, unknown> & { id: string };

export function ordenarAulasPorDataHora<T extends Record<string, unknown> & { id?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = String(a.data ?? "");
    const db = String(b.data ?? "");
    const byDate = da.localeCompare(db);
    if (byDate !== 0) return byDate;
    const ha = String(a.hora_inicio ?? "99:99").slice(0, 5);
    const hb = String(b.hora_inicio ?? "99:99").slice(0, 5);
    const byTime = ha.localeCompare(hb);
    if (byTime !== 0) return byTime;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

/**
 * Lista as turmas do projeto.
 * Quando `restrictToUserId` é passado (professor/auxiliar), aplica filtro
 * pelo vínculo em `instrutor_turmas` para trazer apenas as próprias turmas.
 */
export function turmasListOptions(projetoId: string | null, restrictToUserId?: string | null) {
  return queryOptions({
    queryKey: ["pedagogico", "turmas", projetoId, restrictToUserId ?? "all"],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      let permitidas: Set<string> | null = null;
      if (restrictToUserId) {
        const vinc = await supabase
          .from("instrutor_turmas")
          .select("turma_id")
          .eq("user_id", restrictToUserId);
        if (vinc.error) return { rows: [], error: vinc.error.message };
        permitidas = new Set(((vinc.data ?? []) as { turma_id: string }[]).map((r) => r.turma_id));
        if (permitidas.size === 0) return { rows: [] };
      }
      const { data, error } = await supabase
        .from("turmas")
        .select("*")
        .eq("projeto_id", projetoId);
      if (error) return { rows: [], error: error.message };
      let rows = ((data ?? []) as Row[]);
      if (permitidas) rows = rows.filter((r) => permitidas!.has(String(r.id)));
      rows = rows.slice().sort((a, b) => {
        const an = nomeTurma(a);
        const bn = nomeTurma(b);
        return an.localeCompare(bn, "pt-BR");
      });
      return { rows };
    },
  });
}

export function turmaByIdOptions(turmaId: string) {
  return queryOptions({
    queryKey: ["pedagogico", "turma", turmaId],
    queryFn: async (): Promise<{ row: Row | null; error?: string }> => {
      const { data, error } = await supabase
        .from("turmas")
        .select("*")
        .eq("id", turmaId)
        .maybeSingle();
      if (error) return { row: null, error: error.message };
      return { row: (data as Row) ?? null };
    },
  });
}

export function aulasByTurmaOptions(turmaId: string) {
  return queryOptions({
    queryKey: ["pedagogico", "aulas", turmaId],
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      // Tenta ordenar por "data"; se a coluna não existir, refaz sem ordenação.
      let res = await supabase
        .from("aulas")
        .select("*")
        .eq("turma_id", turmaId)
        .order("data", { ascending: true })
        .order("hora_inicio", { ascending: true, nullsFirst: false });
      if (res.error && /column .*data.* does not exist/i.test(res.error.message)) {
        res = await supabase.from("aulas").select("*").eq("turma_id", turmaId);
      }
      if (res.error) return { rows: [], error: res.error.message };
      return { rows: ordenarAulasPorDataHora((res.data ?? []) as Row[]) };
    },
  });
}

export function cursistasByTurmaOptions(turmaId: string) {
  return queryOptions({
    queryKey: ["pedagogico", "cursistas", turmaId],
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      // matriculas com join em cursistas — se o embed falhar, cai para matriculas simples.
      let res = await supabase
        .from("matriculas")
        .select("*, cursistas(*)")
        .eq("turma_id", turmaId);
      if (res.error) {
        res = await supabase.from("matriculas").select("*").eq("turma_id", turmaId);
      }
      if (res.error) return { rows: [], error: res.error.message };
      return { rows: (res.data ?? []) as Row[] };
    },
  });
}

// Cache para não repetir a descoberta a cada montagem. Falhas não são
// cacheadas: se uma permissão/RLS/transiente falha, a tela deve mostrar erro
// e uma nova tentativa deve realmente consultar o banco de novo.
let frequenciaTableCache: "frequencias" | "presencas" | null = null;

async function detectarTabelaFrequencia(): Promise<"frequencias" | "presencas" | null> {
  if (frequenciaTableCache === "frequencias") return "frequencias";
  if (frequenciaTableCache === "presencas") return "presencas";
  // Prefer `presencas` (real table). `frequencias` may exist as a read-only
  // compatibility view over `presencas` and cannot receive upserts.
  const presencasProbe = await supabase
    .from("presencas")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (!presencasProbe.error) {
    frequenciaTableCache = "presencas";
    // eslint-disable-next-line no-console
    console.info("[frequencia] tabela detectada: presencas");
    return "presencas";
  }

  const presencasMsg = presencasProbe.error.message || "erro desconhecido";
  const presencasNaoExiste = /relation .*presencas.* does not exist|could not find .*presencas|schema cache/i.test(presencasMsg);
  if (!presencasNaoExiste) {
    // eslint-disable-next-line no-console
    console.error("[frequencia] falha ao detectar presencas", presencasProbe.error);
    throw new Error(`Falha ao acessar a tabela presencas: ${presencasMsg}`);
  }

  const frequenciasProbe = await supabase
    .from("frequencias")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (!frequenciasProbe.error) {
    frequenciaTableCache = "frequencias";
    // eslint-disable-next-line no-console
    console.warn("[frequencia] tabela detectada: frequencias (fallback; presencas ausente)");
    return "frequencias";
  }

  const frequenciasMsg = frequenciasProbe.error.message || "erro desconhecido";
  // eslint-disable-next-line no-console
  console.error("[frequencia] nenhuma tabela de frequência disponível", {
    presencas: presencasMsg,
    frequencias: frequenciasMsg,
  });
  throw new Error(`Tabela de frequência indisponível. presencas: ${presencasMsg}; frequencias: ${frequenciasMsg}`);
}

export type FrequenciaRow = {
  id?: string;
  aula_id: string;
  matricula_id: string;
  presente: boolean;
};

export function frequenciaByTurmaOptions(turmaId: string) {
  return queryOptions({
    queryKey: ["pedagogico", "frequencia", turmaId],
    queryFn: async (): Promise<{
      tableName: "frequencias" | "presencas" | null;
      rows: FrequenciaRow[];
      error?: string;
    }> => {
      const tableName = await detectarTabelaFrequencia();
      if (!tableName) return { tableName: null, rows: [] };
      // Buscar frequência das aulas desta turma.
      const aulasRes = await supabase.from("aulas").select("id").eq("turma_id", turmaId);
      if (aulasRes.error) return { tableName, rows: [], error: aulasRes.error.message };
      const aulaIds = (aulasRes.data ?? []).map((a) => (a as { id: string }).id);
      if (!aulaIds.length) return { tableName, rows: [] };
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .in("aula_id", aulaIds);
      if (error) return { tableName, rows: [], error: error.message };
      const rows = (data ?? []) as FrequenciaRow[];
      // eslint-disable-next-line no-console
      console.info(`[frequencia] ${tableName}: ${rows.length} registro(s) para turma ${turmaId} em ${aulaIds.length} aula(s)`);
      return { tableName, rows };
    },
  });
}

export async function upsertAula(input: {
  id?: string;
  turma_id: string;
  data: string;
  titulo?: string | null;
  duracao?: number | null;
  conteudo_programatico?: string | null;
  ch_prevista?: number | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  instrutor?: string | null;
}) {
  const payload: Record<string, unknown> = {
    turma_id: input.turma_id,
    data: input.data,
  };
  // Espelha campos novos nas colunas legadas para manter compatibilidade
  // com bancos que ainda não têm conteudo_programatico/ch_prevista/hora_*.
  if (input.titulo !== undefined) payload.titulo = input.titulo;
  if (input.conteudo_programatico !== undefined) {
    payload.conteudo_programatico = input.conteudo_programatico;
    payload.conteudo = input.conteudo_programatico;
    if (payload.titulo === undefined) payload.titulo = input.conteudo_programatico;
  }
  if (input.ch_prevista !== undefined && input.ch_prevista !== null) {
    payload.ch_prevista = input.ch_prevista;
    if (input.duracao === undefined) payload.duracao = input.ch_prevista;
  }
  if (input.duracao !== undefined && input.duracao !== null) payload.duracao = input.duracao;
  if (input.hora_inicio !== undefined) payload.hora_inicio = input.hora_inicio;
  if (input.hora_fim !== undefined) payload.hora_fim = input.hora_fim;
  if (input.instrutor !== undefined) payload.instrutor = input.instrutor;

  // Retry progressivo: se o banco não tem alguma coluna nova (PGRST204),
  // remove essa coluna do payload e tenta de novo. Assim funciona antes e
  // depois de aplicar a migração que adiciona os campos.
  const write = async (p: Record<string, unknown>) => {
    return input.id
      ? await supabase.from("aulas").update(p).eq("id", input.id)
      : await supabase.from("aulas").insert(p);
  };
  let attempt = { ...payload };
  for (let i = 0; i < 6; i++) {
    const res = await write(attempt);
    if (!res.error) return;
    const msg = res.error.message || "";
    const m = msg.match(/'([^']+)' column of 'aulas'/i) || msg.match(/column "?([a-z_]+)"? .* does not exist/i);
    if (!m) throw new Error(msg);
    const col = m[1];
    if (!(col in attempt)) throw new Error(msg);
    delete attempt[col];
  }
  throw new Error("Falha ao salvar aula após múltiplas tentativas.");
}

export type UpsertTurmaInput = {
  id?: string;
  projeto_id: string;
  nome: string;
  turno?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  descricao?: string | null;
  local_id?: string | null;
};

// Grava turma tentando "nome" primeiro; se a coluna não existir, refaz com "titulo".
export async function upsertTurma(input: UpsertTurmaInput) {
  const base: Record<string, unknown> = {
    projeto_id: input.projeto_id,
    turno: input.turno ?? null,
    data_inicio: input.data_inicio || null,
    data_fim: input.data_fim || null,
    descricao: input.descricao ?? null,
  };
  if (input.local_id !== undefined) base.local_id = input.local_id;
  // Limpa nulls opcionais sem valor para não sobrescrever colunas inexistentes.
  const write = async (nameKey: "nome" | "titulo") => {
    const payload = { ...base, [nameKey]: input.nome };
    if (input.id) {
      return supabase.from("turmas").update(payload).eq("id", input.id);
    }
    return supabase.from("turmas").insert(payload);
  };
  let res = await write("nome");
  if (res.error && /column .*local_id.* does not exist/i.test(res.error.message)) {
    delete base.local_id;
    res = await write("nome");
  }
  if (res.error && /column .*(nome).* does not exist/i.test(res.error.message)) {
    res = await write("titulo");
  }
  // Se "descricao" ou "turno" faltarem, tenta sem esses campos.
  if (res.error && /column .*(descricao|turno|data_inicio|data_fim).* does not exist/i.test(res.error.message)) {
    const minimal: Record<string, unknown> = { projeto_id: input.projeto_id, nome: input.nome };
    if (input.id) {
      res = await supabase.from("turmas").update(minimal).eq("id", input.id);
    } else {
      res = await supabase.from("turmas").insert(minimal);
    }
    if (res.error && /column .*(nome).* does not exist/i.test(res.error.message)) {
      const minimal2 = { projeto_id: input.projeto_id, titulo: input.nome };
      res = input.id
        ? await supabase.from("turmas").update(minimal2).eq("id", input.id)
        : await supabase.from("turmas").insert(minimal2);
    }
  }
  if (res.error) throw new Error(res.error.message);
}

export async function deleteTurma(id: string) {
  const { error } = await supabase.from("turmas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAula(id: string) {
  // Blindagem: se a aula tem presenças registradas, recusa a exclusão em vez de
  // deixar o cascade do banco apagar as marcações em silêncio. Corrige o caso
  // em que uma aula com chamada preenchida some junto com todas as presenças
  // quando alguém clica em "Excluir aula" por engano.
  const pres = await supabase
    .from("presencas")
    .select("id", { head: true, count: "exact" })
    .eq("aula_id", id);
  if (!pres.error && (pres.count ?? 0) > 0) {
    throw new Error(
      `Esta aula tem ${pres.count} presença(s) registrada(s). ` +
        `Remova as marcações na aba Frequência antes de excluir a aula.`,
    );
  }
  const { error } = await supabase.from("aulas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function upsertFrequencia(input: {
  aula_id: string;
  matricula_id: string;
  presente: boolean;
}) {
  const tableName = await detectarTabelaFrequencia();
  if (!tableName) throw new Error("Tabela de frequência não configurada no banco.");
  const { error } = await supabase
    .from(tableName)
    .upsert(
      { aula_id: input.aula_id, matricula_id: input.matricula_id, presente: input.presente },
      { onConflict: "aula_id,matricula_id" },
    );
  if (error) throw new Error(error.message);
}

/**
 * Upsert em lote de frequência. Usado por "Fechar chamada" para marcar
 * como falta todas as cursistas ainda não lançadas em uma aula.
 */
export async function upsertFrequenciaBatch(rows: FrequenciaRow[]): Promise<void> {
  if (!rows.length) return;
  const tableName = await detectarTabelaFrequencia();
  if (!tableName) throw new Error("Tabela de frequência não configurada no banco.");
  const payload = rows.map((r) => ({
    aula_id: r.aula_id,
    matricula_id: r.matricula_id,
    presente: r.presente,
  }));
  const { error } = await supabase
    .from(tableName)
    .upsert(payload, { onConflict: "aula_id,matricula_id" });
  if (error) throw new Error(error.message);
}

// Helpers de apresentação dos rows descobertos em runtime.
export function pickFirst(row: Row | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

// Rótulo humano de uma turma. Usa nome/titulo/descricao quando existirem;
// caso contrário cai no codigo_turma (ex.: JBT-MC-01) ou nome_curso — nunca
// exibe o UUID cru.
export function nomeTurma(row: Row | null | undefined): string {
  return (
    pickFirst(row, ["nome", "titulo", "descricao", "codigo_turma", "nome_curso"]) ??
    "Turma sem nome"
  );
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  } catch {
    return String(iso);
  }
}

// ============================================================================
// Comprovação por aula — evidências vinculadas (lista_presenca / foto)
// ============================================================================

export type EvidenciaAula = {
  id: string;
  turma_id: string | null;
  aula_id: string | null;
  tipo: string;
  descricao: string | null;
  arquivo_url: string;
  arquivo_nome: string | null;
  enviado_por: string | null;
  created_at?: string | null;
};

export const TIPOS_COMPROVACAO_AULA = [
  { value: "lista_presenca", label: "Lista de presença" },
  { value: "registro_fotografico", label: "Registro fotográfico" },
] as const;

/** Lista evidências de uma aula específica. */
export function evidenciasByAulaOptions(aulaId: string | null) {
  return queryOptions({
    queryKey: ["pedagogico", "evidencias-aula", aulaId],
    enabled: !!aulaId,
    queryFn: async (): Promise<{ rows: EvidenciaAula[]; error?: string }> => {
      if (!aulaId) return { rows: [] };
      const { data, error } = await supabase
        .from("evidencias")
        .select("*")
        .eq("aula_id", aulaId)
        .order("created_at", { ascending: false });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as EvidenciaAula[] };
    },
  });
}

/** Mapa `aula_id -> quantidade de listas_presenca` para uma turma. */
export function evidenciasCountByTurmaOptions(turmaId: string) {
  return queryOptions({
    queryKey: ["pedagogico", "evidencias-count-turma", turmaId],
    queryFn: async (): Promise<{ byAula: Record<string, number>; total: number; error?: string }> => {
      const { data, error } = await supabase
        .from("evidencias")
        .select("id, aula_id, tipo")
        .eq("turma_id", turmaId)
        .eq("tipo", "lista_presenca");
      if (error) return { byAula: {}, total: 0, error: error.message };
      const byAula: Record<string, number> = {};
      for (const r of (data ?? []) as { aula_id: string | null }[]) {
        if (!r.aula_id) continue;
        byAula[r.aula_id] = (byAula[r.aula_id] ?? 0) + 1;
      }
      return { byAula, total: (data ?? []).length };
    },
  });
}

function slugSafe(s: string | null | undefined, fallback = "SC"): string {
  return String(s ?? fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .toUpperCase();
}

export function nomeArquivoComprovacao(input: {
  codigo_turma: string | null;
  data_aula: string | null;
  tipo: string;
  index: number;
  ext: string;
}): string {
  const cod = slugSafe(input.codigo_turma);
  const data = (input.data_aula ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const tipoLabel = input.tipo === "lista_presenca" ? "lista-presenca" : "registro";
  return `${cod}_${data}_${tipoLabel}-${input.index}.${input.ext.toLowerCase()}`;
}

export type UploadComprovacaoInput = {
  turma_id: string;
  aula_id: string;
  codigo_turma: string | null;
  data_aula: string | null;
  tipo: "lista_presenca" | "registro_fotografico" | string;
  contem_pmq: boolean;
  files: File[];
};

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

export async function uploadEvidenciasAula(input: UploadComprovacaoInput): Promise<{ inserted: number }> {
  if (!input.files.length) return { inserted: 0 };
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess?.user?.id ?? null;

  const dataLabel = (input.data_aula ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const codigo = slugSafe(input.codigo_turma);
  let inserted = 0;

  for (let i = 0; i < input.files.length; i += 1) {
    const f = input.files[i];
    if (f.size > MAX_BYTES) {
      throw new Error(`"${f.name}" excede 10 MB.`);
    }
    const mime = f.type || "";
    if (mime && !OK_TYPES.includes(mime)) {
      // aceitar mesmo assim se extensão for válida
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
        throw new Error(`"${f.name}" tem formato não suportado. Use PDF, JPG ou PNG.`);
      }
    }
    const ext = (f.name.split(".").pop() || "bin").toLowerCase();
    const nomePadronizado = nomeArquivoComprovacao({
      codigo_turma: input.codigo_turma,
      data_aula: dataLabel,
      tipo: input.tipo,
      index: i + 1,
      ext,
    });
    const path = `${codigo}/${dataLabel}/${nomePadronizado}`;

    const up = await supabase.storage
      .from("evidencias")
      .upload(path, f, { upsert: false, contentType: f.type || `application/${ext}` });
    if (up.error) throw new Error(`Falha ao enviar "${f.name}": ${up.error.message}`);
    const pub = supabase.storage.from("evidencias").getPublicUrl(path);

    const tipoLabel = input.tipo === "lista_presenca" ? "Lista de presença" : "Registro fotográfico";
    const descricao =
      `${tipoLabel} ${input.codigo_turma ?? ""} ${dataLabel}`.trim() +
      (input.contem_pmq ? " | PMQ:sim" : " | PMQ:nao");

    const payload: Record<string, unknown> = {
      turma_id: input.turma_id,
      aula_id: input.aula_id,
      tipo: input.tipo,
      descricao,
      arquivo_url: pub.data.publicUrl,
      arquivo_nome: nomePadronizado,
    };
    if (uid) payload.enviado_por = uid;

    let res = await supabase.from("evidencias").insert(payload);
    // Retry sem enviado_por caso a coluna ainda não exista.
    if (res.error && /enviado_por/i.test(res.error.message)) {
      delete payload.enviado_por;
      res = await supabase.from("evidencias").insert(payload);
    }
    if (res.error) throw new Error(`Falha ao registrar evidência: ${res.error.message}`);
    inserted += 1;
  }
  return { inserted };
}

/** Deriva o storage path a partir de uma URL pública do bucket evidencias. */
export function pathFromEvidenciaUrl(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/evidencias\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

/** Abre a evidência via URL assinada (bucket privado). */
export async function abrirEvidencia(ev: { arquivo_url: string }): Promise<string> {
  const path = pathFromEvidenciaUrl(ev.arquivo_url);
  if (!path) return ev.arquivo_url;
  const { data, error } = await supabase.storage.from("evidencias").createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) return ev.arquivo_url;
  return data.signedUrl;
}

export async function excluirEvidenciaAula(ev: { id: string; arquivo_url: string }): Promise<void> {
  const path = pathFromEvidenciaUrl(ev.arquivo_url);
  if (path) {
    await supabase.storage.from("evidencias").remove([path]);
  }
  const { error } = await supabase.from("evidencias").delete().eq("id", ev.id);
  if (error) throw new Error(error.message);
}

/** Contém identificação PMQ codificada no descricao pelo uploader. */
export function evidenciaTemPmq(descricao: string | null | undefined): boolean {
  return /PMQ\s*:\s*sim/i.test(String(descricao ?? ""));
}