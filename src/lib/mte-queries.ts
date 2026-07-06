import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Tipagens espelhando a migration MTE (nomes conforme especificação).
// Uso o cliente Supabase sem geração de tipos; queries retornam o shape aqui.

export const NOMES_CURSO = [
  "Técnico em Suporte de TI",
  "Programador(a) Web",
] as const;
export const TURNOS = ["Manhã", "Tarde", "Noite"] as const;
export const MUNICIPIOS = ["Belo Horizonte", "Betim", "Juatuba"] as const;
export const CICLOS = [1, 2] as const;

export type TurmaMTE = {
  id: string;
  instrumento_id: string | null;
  executora: string | null;
  nome_curso: string | null;
  codigo_turma: string | null;
  turno: string | null;
  horario_realizacao: string | null;
  ch_conhecimentos_gerais: number | null;
  ch_conhecimentos_especificos: number | null;
  ch_total: number | null;
  qtd_dias_curso: number | null;
  dias_semana: string | null;
  vagas: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  municipio: string | null;
  local_endereco: string | null;
  contato_local_nome: string | null;
  contato_local_telefone: string | null;
  ciclo: number | null;
  observacoes: string | null;
  created_at?: string;
};

export type Beneficiaria = {
  id: string;
  nome: string;
  cpf: string;
  data_nascimento: string | null;
  genero: string | null;
  raca: string | null;
  pcd: boolean | null;
  tipo_deficiencia: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  municipio: string | null;
  nis: string | null;
  beneficiaria_programa_social: boolean | null;
  qual_programa_social: string | null;
  created_at?: string;
};

export type Matricula = {
  id: string;
  turma_id: string;
  beneficiaria_id: string;
  status: string | null;
  data_inscricao: string | null;
  data_conclusao: string | null;
  motivo_evasao: string | null;
  ficha_inscricao_url: string | null;
  frequencia_percentual: number | null;
  created_at?: string;
};

export const MATRICULA_STATUS = [
  "inscrita",
  "matriculada",
  "cursando",
  "concluinte",
  "evadida",
  "desistente",
] as const;
export type MatriculaStatus = (typeof MATRICULA_STATUS)[number];

/** Campos exigidos pela fiscalização MTE. */
export const CAMPOS_OBRIGATORIOS_TURMA: (keyof TurmaMTE)[] = [
  "data_inicio",
  "data_fim",
  "horario_realizacao",
  "local_endereco",
  "contato_local_nome",
];

export function faltantesTurma(t: Partial<TurmaMTE>): string[] {
  const labels: Record<string, string> = {
    data_inicio: "Data de início",
    data_fim: "Data de fim",
    horario_realizacao: "Horário de realização",
    local_endereco: "Local / endereço",
    contato_local_nome: "Contato do local",
  };
  return CAMPOS_OBRIGATORIOS_TURMA.filter((k) => {
    const v = t[k];
    return v == null || (typeof v === "string" && v.trim().length === 0);
  }).map((k) => labels[k as string] ?? String(k));
}

// ============================== Turmas ==============================

export function turmasMteListOptions() {
  return queryOptions({
    queryKey: ["mte", "turmas"],
    queryFn: async (): Promise<{ rows: TurmaMTE[]; error?: string }> => {
      const { data, error } = await supabase
        .from("turmas")
        .select("*")
        .order("data_inicio", { ascending: false });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as TurmaMTE[] };
    },
  });
}

export async function upsertTurmaMTE(input: Partial<TurmaMTE> & { id?: string }) {
  const ch_g = Number(input.ch_conhecimentos_gerais ?? 0) || 0;
  const ch_e = Number(input.ch_conhecimentos_especificos ?? 0) || 0;
  const payload: Record<string, unknown> = {
    executora: input.executora ?? "QUINTA ARTE",
    nome_curso: input.nome_curso ?? null,
    codigo_turma: input.codigo_turma ?? null,
    turno: input.turno ?? null,
    horario_realizacao: input.horario_realizacao ?? null,
    ch_conhecimentos_gerais: ch_g,
    ch_conhecimentos_especificos: ch_e,
    ch_total: ch_g + ch_e,
    qtd_dias_curso: input.qtd_dias_curso ?? null,
    dias_semana: input.dias_semana ?? null,
    vagas: input.vagas ?? 50,
    data_inicio: input.data_inicio || null,
    data_fim: input.data_fim || null,
    municipio: input.municipio ?? null,
    local_endereco: input.local_endereco ?? null,
    contato_local_nome: input.contato_local_nome ?? null,
    contato_local_telefone: input.contato_local_telefone ?? null,
    ciclo: input.ciclo ?? null,
    observacoes: input.observacoes ?? null,
  };
  if (input.instrumento_id) payload.instrumento_id = input.instrumento_id;
  if (input.id) {
    const { error } = await supabase.from("turmas").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("turmas").insert(payload);
    if (error) throw new Error(error.message);
  }
}

export async function deleteTurmaMTE(id: string) {
  const { error } = await supabase.from("turmas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ========================== Beneficiárias ===========================

export function beneficiariasListOptions(search: string = "") {
  return queryOptions({
    queryKey: ["mte", "beneficiarias", search],
    queryFn: async (): Promise<{ rows: Beneficiaria[]; error?: string }> => {
      let q = supabase.from("beneficiarias").select("*").order("nome", { ascending: true }).limit(500);
      const s = search.trim();
      if (s) q = q.or(`nome.ilike.%${s}%,cpf.ilike.%${s}%`);
      const { data, error } = await q;
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as Beneficiaria[] };
    },
  });
}

export async function upsertBeneficiaria(input: Partial<Beneficiaria> & { id?: string }) {
  const payload: Record<string, unknown> = {
    nome: input.nome ?? null,
    cpf: input.cpf ?? null,
    data_nascimento: input.data_nascimento || null,
    genero: input.genero ?? null,
    raca: input.raca ?? null,
    pcd: input.pcd ?? false,
    tipo_deficiencia: input.pcd ? (input.tipo_deficiencia ?? null) : null,
    telefone: input.telefone ?? null,
    email: input.email ?? null,
    endereco: input.endereco ?? null,
    municipio: input.municipio ?? null,
    nis: input.nis ?? null,
    beneficiaria_programa_social: input.beneficiaria_programa_social ?? false,
    qual_programa_social: input.beneficiaria_programa_social
      ? (input.qual_programa_social ?? null)
      : null,
  };
  if (input.id) {
    const { error } = await supabase.from("beneficiarias").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("beneficiarias").insert(payload);
    if (error) throw new Error(error.message);
  }
}

export async function deleteBeneficiaria(id: string) {
  const { error } = await supabase.from("beneficiarias").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function importBeneficiariasBulk(rows: Partial<Beneficiaria>[]) {
  if (!rows.length) return { inserted: 0 };
  const { data, error } = await supabase
    .from("beneficiarias")
    .upsert(rows, { onConflict: "cpf", ignoreDuplicates: false })
    .select("id");
  if (error) throw new Error(error.message);
  return { inserted: (data ?? []).length };
}

// ============================ Matrículas ============================

export function matriculasListOptions(turmaId: string | null) {
  return queryOptions({
    queryKey: ["mte", "matriculas", turmaId],
    enabled: !!turmaId,
    queryFn: async (): Promise<{
      rows: (Matricula & { beneficiaria?: Beneficiaria | null })[];
      error?: string;
    }> => {
      if (!turmaId) return { rows: [] };
      let res = await supabase
        .from("matriculas")
        .select("*, beneficiaria:beneficiarias(*)")
        .eq("turma_id", turmaId);
      if (res.error) {
        res = await supabase.from("matriculas").select("*").eq("turma_id", turmaId);
      }
      if (res.error) return { rows: [], error: res.error.message };
      const rows = (res.data ?? []) as (Matricula & { beneficiaria?: Beneficiaria | null })[];
      return { rows };
    },
  });
}

export async function upsertMatricula(input: Partial<Matricula> & { id?: string }) {
  const payload: Record<string, unknown> = {
    turma_id: input.turma_id,
    beneficiaria_id: input.beneficiaria_id,
    status: input.status ?? "inscrita",
    data_inscricao: input.data_inscricao || new Date().toISOString().slice(0, 10),
    data_conclusao: input.status === "concluinte" ? input.data_conclusao || null : null,
    motivo_evasao:
      input.status === "evadida" || input.status === "desistente"
        ? (input.motivo_evasao ?? null)
        : null,
    ficha_inscricao_url: input.ficha_inscricao_url ?? null,
  };
  if (input.id) {
    const { error } = await supabase.from("matriculas").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
    return input.id;
  }
  const { data, error } = await supabase.from("matriculas").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteMatricula(id: string) {
  const { error } = await supabase.from("matriculas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Envia PDF da ficha de inscrição para o bucket `evidencias` e retorna URL pública. */
export async function uploadFichaInscricao(matriculaId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `matriculas/${matriculaId}/ficha-inscricao-${Date.now()}.${ext}`;
  const up = await supabase.storage
    .from("evidencias")
    .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
  if (up.error) throw new Error(up.error.message);
  const pub = supabase.storage.from("evidencias").getPublicUrl(path);
  const url = pub.data.publicUrl;
  await supabase.from("matriculas").update({ ficha_inscricao_url: url }).eq("id", matriculaId);
  return url;
}