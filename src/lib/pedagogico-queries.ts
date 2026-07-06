import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Todas as queries retornam { data, error } no mesmo padrão de dashboard-queries.ts.
// O schema é descoberto em runtime — colunas ausentes viram "—" na UI.

export type Row = Record<string, unknown> & { id: string };

export function turmasListOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["pedagogico", "turmas", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ rows: Row[]; error?: string }> => {
      if (!projetoId) return { rows: [] };
      const { data, error } = await supabase
        .from("turmas")
        .select("*")
        .eq("projeto_id", projetoId);
      if (error) return { rows: [], error: error.message };
      const rows = ((data ?? []) as Row[]).slice().sort((a, b) => {
        const an = pickFirst(a, ["nome", "titulo", "descricao"]) ?? "";
        const bn = pickFirst(b, ["nome", "titulo", "descricao"]) ?? "";
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
        .order("data", { ascending: true });
      if (res.error && /column .*data.* does not exist/i.test(res.error.message)) {
        res = await supabase.from("aulas").select("*").eq("turma_id", turmaId);
      }
      if (res.error) return { rows: [], error: res.error.message };
      return { rows: (res.data ?? []) as Row[] };
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

// Cache para não repetir a descoberta a cada montagem.
let frequenciaTableCache: "frequencias" | "presencas" | "none" | null = null;

async function detectarTabelaFrequencia(): Promise<"frequencias" | "presencas" | null> {
  if (frequenciaTableCache === "frequencias") return "frequencias";
  if (frequenciaTableCache === "presencas") return "presencas";
  if (frequenciaTableCache === "none") return null;
  for (const t of ["frequencias", "presencas"] as const) {
    const { error } = await supabase.from(t).select("id", { head: true, count: "exact" }).limit(1);
    if (!error) {
      frequenciaTableCache = t;
      return t;
    }
  }
  frequenciaTableCache = "none";
  return null;
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
      return { tableName, rows: (data ?? []) as FrequenciaRow[] };
    },
  });
}

export async function upsertAula(input: {
  id?: string;
  turma_id: string;
  data: string;
  titulo?: string | null;
  duracao?: number | null;
}) {
  const payload: Record<string, unknown> = {
    turma_id: input.turma_id,
    data: input.data,
  };
  if (input.titulo !== undefined) payload.titulo = input.titulo;
  if (input.duracao !== undefined && input.duracao !== null) payload.duracao = input.duracao;
  if (input.id) {
    const { error } = await supabase.from("aulas").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("aulas").insert(payload);
    if (error) throw new Error(error.message);
  }
}

export type UpsertTurmaInput = {
  id?: string;
  projeto_id: string;
  nome: string;
  turno?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  descricao?: string | null;
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
  // Limpa nulls opcionais sem valor para não sobrescrever colunas inexistentes.
  const write = async (nameKey: "nome" | "titulo") => {
    const payload = { ...base, [nameKey]: input.nome };
    if (input.id) {
      return supabase.from("turmas").update(payload).eq("id", input.id);
    }
    return supabase.from("turmas").insert(payload);
  };
  let res = await write("nome");
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

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  } catch {
    return String(iso);
  }
}