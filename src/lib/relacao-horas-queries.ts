import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RelacaoStatus = "rascunho" | "enviada" | "aprovada" | "rejeitada";

export type RelacaoHoras = {
  id: string;
  user_id: string;
  mes_referencia: string; // YYYY-MM-01
  local_trabalho: string | null;
  status: RelacaoStatus;
  total_horas: number;
  valor_hora: number;
  valor_total: number;
  assinatura_nome: string | null;
  assinatura_hash: string | null;
  assinado_em: string | null;
  enviado_em: string | null;
  avaliado_por: string | null;
  avaliado_em: string | null;
  observacao_avaliacao: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type RelacaoItem = {
  id: string;
  relacao_id: string;
  data: string; // YYYY-MM-DD
  hora_entrada: string | null;
  hora_saida: string | null;
  total_horas: number;
  valor_dia: number;
};

export function minhasRelacoesOptions(userId: string | null) {
  return queryOptions({
    queryKey: ["relacoes-horas", "minhas", userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ rows: RelacaoHoras[]; error?: string }> => {
      if (!userId) return { rows: [] };
      const { data, error } = await supabase
        .from("relacoes_horas" as any)
        .select("*")
        .eq("user_id", userId)
        .order("mes_referencia", { ascending: false });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as RelacaoHoras[] };
    },
  });
}

export function pendentesFinanceiroOptions() {
  return queryOptions({
    queryKey: ["relacoes-horas", "financeiro"],
    queryFn: async (): Promise<{ rows: RelacaoHoras[]; error?: string }> => {
      const { data, error } = await supabase
        .from("relacoes_horas" as any)
        .select("*")
        .in("status", ["enviada", "aprovada", "rejeitada"])
        .order("enviado_em", { ascending: false });
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as RelacaoHoras[] };
    },
  });
}

export function relacaoDetalheOptions(relacaoId: string | null) {
  return queryOptions({
    queryKey: ["relacoes-horas", "detalhe", relacaoId],
    enabled: !!relacaoId,
    queryFn: async (): Promise<{
      relacao: RelacaoHoras | null;
      itens: RelacaoItem[];
      error?: string;
    }> => {
      if (!relacaoId) return { relacao: null, itens: [] };
      const rel = await supabase.from("relacoes_horas" as any).select("*").eq("id", relacaoId).maybeSingle();
      if (rel.error) return { relacao: null, itens: [], error: rel.error.message };
      const itens = await supabase
        .from("relacoes_horas_itens" as any)
        .select("*")
        .eq("relacao_id", relacaoId)
        .order("data", { ascending: true });
      if (itens.error) return { relacao: rel.data as RelacaoHoras, itens: [], error: itens.error.message };
      return { relacao: rel.data as RelacaoHoras, itens: (itens.data ?? []) as RelacaoItem[] };
    },
  });
}

/* ============================================================
 * Ações
 * ============================================================ */

function primeiroDiaMes(mes: string): string {
  return `${mes}-01`;
}

function diasDoMes(mes: string): string[] {
  const [y, m] = mes.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${mes}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

function diffHoras(entrada: string | null, saida: string | null): number {
  if (!entrada || !saida) return 0;
  const [eh, em] = entrada.split(":").map(Number);
  const [sh, sm] = saida.split(":").map(Number);
  const mins = sh * 60 + sm - (eh * 60 + em);
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

export async function gerarRascunhoDoMes(params: {
  userId: string;
  mes: string; // YYYY-MM
  localTrabalho?: string;
}): Promise<{ relacaoId: string }> {
  const mesRef = primeiroDiaMes(params.mes);
  const [y, m] = params.mes.split("-").map(Number);
  const inicio = `${params.mes}-01`;
  const fim = `${params.mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  // Turmas do professor + valor_hora
  const vinc = await supabase
    .from("instrutor_turmas")
    .select("turma_id, valor_hora")
    .eq("user_id", params.userId);
  if (vinc.error) throw new Error(vinc.error.message);
  const turmas = (vinc.data ?? []) as { turma_id: string; valor_hora: number | null }[];
  const turmaValor = new Map(turmas.map((t) => [t.turma_id, Number(t.valor_hora ?? 40)]));
  const valorMedio = turmas.length
    ? turmas.reduce((s, t) => s + Number(t.valor_hora ?? 40), 0) / turmas.length
    : 40;

  // Aulas dentro do período nas turmas do professor
  let aulas: any[] = [];
  if (turmas.length > 0) {
    // A tabela pode ter "data_aula" ou "data" — tenta os dois
    let res = await supabase
      .from("aulas")
      .select("id, turma_id, data, data_aula, hora_inicio, hora_fim")
      .in("turma_id", turmas.map((t) => t.turma_id));
    if (res.error) throw new Error(res.error.message);
    aulas = (res.data ?? []).filter((a: any) => {
      const d: string = (a.data_aula ?? a.data ?? "").slice(0, 10);
      return d >= inicio && d <= fim;
    });
  }

  // Upsert da relacao (rascunho)
  const existing = await supabase
    .from("relacoes_horas" as any)
    .select("id, status")
    .eq("user_id", params.userId)
    .eq("mes_referencia", mesRef)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data && (existing.data as any).status !== "rascunho") {
    throw new Error("Já existe relação enviada para este mês. Não é possível regenerar.");
  }

  let relacaoId: string;
  if (existing.data) {
    relacaoId = (existing.data as any).id;
    await supabase.from("relacoes_horas_itens" as any).delete().eq("relacao_id", relacaoId);
    await supabase.from("relacoes_horas" as any)
      .update({ local_trabalho: params.localTrabalho ?? null, valor_hora: valorMedio })
      .eq("id", relacaoId);
  } else {
    const ins = await supabase
      .from("relacoes_horas" as any)
      .insert({
        user_id: params.userId,
        mes_referencia: mesRef,
        local_trabalho: params.localTrabalho ?? null,
        status: "rascunho",
        valor_hora: valorMedio,
      })
      .select("id")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    relacaoId = (ins.data as any).id;
  }

  // Agrega aulas por dia
  type Item = { data: string; entrada: string | null; saida: string | null; total: number; valor: number };
  const porDia = new Map<string, Item>();
  for (const a of aulas) {
    const d: string = (a.data_aula ?? a.data ?? "").slice(0, 10);
    if (!d) continue;
    const he: string | null = (a.hora_inicio ?? null) as any;
    const hs: string | null = (a.hora_fim ?? null) as any;
    const total = diffHoras(he, hs);
    const vh = turmaValor.get(a.turma_id) ?? valorMedio;
    const valor = Math.round(total * vh * 100) / 100;
    const cur = porDia.get(d);
    if (!cur) {
      porDia.set(d, { data: d, entrada: he, saida: hs, total, valor });
    } else {
      // se houver múltiplas aulas no mesmo dia, mantém primeira entrada e última saída, soma horas/valor
      cur.entrada = cur.entrada ?? he;
      cur.saida = hs ?? cur.saida;
      cur.total = Math.round((cur.total + total) * 100) / 100;
      cur.valor = Math.round((cur.valor + valor) * 100) / 100;
    }
  }

  // Insere itens para todos os dias do mês (dias sem aula ficam vazios)
  const rows = diasDoMes(params.mes).map((d) => {
    const it = porDia.get(d);
    return {
      relacao_id: relacaoId,
      data: d,
      hora_entrada: it?.entrada ?? null,
      hora_saida: it?.saida ?? null,
      total_horas: it?.total ?? 0,
      valor_dia: it?.valor ?? 0,
    };
  });
  const ins2 = await supabase.from("relacoes_horas_itens" as any).insert(rows);
  if (ins2.error) throw new Error(ins2.error.message);

  await recomputarTotais(relacaoId);
  return { relacaoId };
}

export async function recomputarTotais(relacaoId: string) {
  const itens = await supabase
    .from("relacoes_horas_itens" as any)
    .select("total_horas, valor_dia")
    .eq("relacao_id", relacaoId);
  if (itens.error) throw new Error(itens.error.message);
  const totalH = (itens.data ?? []).reduce((s: number, r: any) => s + Number(r.total_horas ?? 0), 0);
  const totalV = (itens.data ?? []).reduce((s: number, r: any) => s + Number(r.valor_dia ?? 0), 0);
  await supabase.from("relacoes_horas" as any).update({
    total_horas: Math.round(totalH * 100) / 100,
    valor_total: Math.round(totalV * 100) / 100,
  }).eq("id", relacaoId);
}

export async function salvarItem(item: {
  id: string;
  hora_entrada: string | null;
  hora_saida: string | null;
  valor_hora: number;
}) {
  const total = diffHoras(item.hora_entrada, item.hora_saida);
  const valor = Math.round(total * item.valor_hora * 100) / 100;
  const { error } = await supabase.from("relacoes_horas_itens" as any).update({
    hora_entrada: item.hora_entrada,
    hora_saida: item.hora_saida,
    total_horas: total,
    valor_dia: valor,
  }).eq("id", item.id);
  if (error) throw new Error(error.message);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function assinarEEnviar(params: {
  relacaoId: string;
  userId: string;
  nomeAssinatura: string;
}): Promise<{ hash: string }> {
  const detalhe = await supabase
    .from("relacoes_horas_itens" as any)
    .select("data, hora_entrada, hora_saida, total_horas, valor_dia")
    .eq("relacao_id", params.relacaoId)
    .order("data", { ascending: true });
  if (detalhe.error) throw new Error(detalhe.error.message);
  const now = new Date().toISOString();
  const canonical = JSON.stringify({ user_id: params.userId, itens: detalhe.data ?? [], timestamp: now });
  const hash = await sha256Hex(canonical);
  const upd = await supabase.from("relacoes_horas" as any).update({
    status: "enviada",
    assinatura_nome: params.nomeAssinatura,
    assinatura_hash: hash,
    assinado_em: now,
    enviado_em: now,
  }).eq("id", params.relacaoId);
  if (upd.error) throw new Error(upd.error.message);

  // Notifica financeiro (broadcast por user_id NULL)
  await supabase.from("notificacoes").insert({
    tipo: "relacao_horas_enviada",
    severidade: "info",
    titulo: "Relação de Horas enviada para aprovação",
    corpo: `${params.nomeAssinatura} enviou relação de horas para o financeiro.`,
    link_rota: `/financeiro/relacoes-horas`,
    origem: "sistema",
    user_id: null,
  } as any);

  return { hash };
}

export async function decidirRelacao(params: {
  relacaoId: string;
  avaliadorId: string;
  decisao: "aprovada" | "rejeitada";
  observacao: string;
  professorUserId: string;
  professorNome?: string;
}) {
  const upd = await supabase.from("relacoes_horas" as any).update({
    status: params.decisao,
    avaliado_por: params.avaliadorId,
    avaliado_em: new Date().toISOString(),
    observacao_avaliacao: params.observacao || null,
  }).eq("id", params.relacaoId);
  if (upd.error) throw new Error(upd.error.message);

  await supabase.from("notificacoes").insert({
    tipo: `relacao_horas_${params.decisao}`,
    severidade: params.decisao === "aprovada" ? "sucesso" : "warn",
    titulo:
      params.decisao === "aprovada"
        ? "Sua Relação de Horas foi aprovada"
        : "Sua Relação de Horas foi rejeitada",
    corpo: params.observacao || null,
    link_rota: `/relacao-horas`,
    origem: "sistema",
    user_id: params.professorUserId,
  } as any);
}