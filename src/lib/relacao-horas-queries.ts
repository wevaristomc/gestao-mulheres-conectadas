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
  dias_trabalhados: number;
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
  saida_almoco: string | null;
  retorno: string | null;
  hora_saida: string | null;
  total_horas: number;
  valor_dia: number;
  conteudo: string | null;
};

export type TurmaVinculo = {
  turma_id: string;
  codigo: string | null;
  nome: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  turno: string | null;
  valor_hora: number;
  local: string | null;
};

function turnoLabel(t: TurmaVinculo): "manha" | "tarde" | "noite" {
  const raw = (t.turno ?? "").toLowerCase();
  if (raw.includes("manh")) return "manha";
  if (raw.includes("tard")) return "tarde";
  if (raw.includes("noit")) return "noite";
  const hi = t.hora_inicio ?? "";
  const h = Number(hi.slice(0, 2) || 0);
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export function classificarTurno(t: TurmaVinculo): "manha" | "tarde" | "noite" {
  return turnoLabel(t);
}

export function turmasDoUsuarioOptions(userId: string | null) {
  return queryOptions({
    queryKey: ["relacoes-horas", "turmas-usuario", userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ rows: TurmaVinculo[]; error?: string }> => {
      if (!userId) return { rows: [] };
      const vinc = await supabase
        .from("instrutor_turmas")
        .select("turma_id, valor_hora")
        .eq("user_id", userId);
      if (vinc.error) return { rows: [], error: vinc.error.message };
      const ids = (vinc.data ?? []).map((r: any) => r.turma_id as string);
      if (ids.length === 0) return { rows: [] };
      const t = await supabase.from("turmas").select("*").in("id", ids);
      if (t.error) return { rows: [], error: t.error.message };
      const valorMap = new Map((vinc.data ?? []).map((r: any) => [r.turma_id, Number(r.valor_hora ?? 40)]));
      const rows: TurmaVinculo[] = ((t.data ?? []) as any[]).map((r) => ({
        turma_id: String(r.id),
        codigo: (r.codigo_turma ?? r.codigo ?? null) as string | null,
        nome: (r.nome ?? r.titulo ?? null) as string | null,
        hora_inicio: (r.hora_inicio ?? null) as string | null,
        hora_fim: (r.hora_fim ?? null) as string | null,
        turno: (r.turno ?? r.periodo ?? null) as string | null,
        valor_hora: valorMap.get(String(r.id)) ?? 40,
        local: (r.local ?? r.local_aula ?? r.endereco ?? null) as string | null,
      }));
      return { rows };
    },
  });
}

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

function diffMinutos(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.max(0, bh * 60 + bm - (ah * 60 + am));
}
function toHoras(mins: number): number {
  return Math.round((mins / 60) * 100) / 100;
}
function timeHM(t: string | null): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
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

  // Turmas do professor (com metadados) + valor_hora
  const vinc = await supabase
    .from("instrutor_turmas")
    .select("turma_id, valor_hora")
    .eq("user_id", params.userId);
  if (vinc.error) throw new Error(vinc.error.message);
  const vincRows = (vinc.data ?? []) as { turma_id: string; valor_hora: number | null }[];
  const turmaValor = new Map(vincRows.map((t) => [t.turma_id, Number(t.valor_hora ?? 40)]));
  const valorMedio = vincRows.length
    ? vincRows.reduce((s, t) => s + Number(t.valor_hora ?? 40), 0) / vincRows.length
    : 40;

  const turmasMeta = new Map<string, { codigo: string | null; hi: string | null; hf: string | null }>();
  if (vincRows.length > 0) {
    const t = await supabase
      .from("turmas")
      .select("id, codigo_turma, hora_inicio, hora_fim")
      .in("id", vincRows.map((t) => t.turma_id));
    if (!t.error) {
      for (const r of (t.data ?? []) as any[]) {
        turmasMeta.set(String(r.id), {
          codigo: (r.codigo_turma ?? null) as string | null,
          hi: (r.hora_inicio ?? null) as string | null,
          hf: (r.hora_fim ?? null) as string | null,
        });
      }
    }
  }

  // Aulas dentro do período nas turmas do professor
  let aulas: any[] = [];
  if (vincRows.length > 0) {
    // Tenta com conteudo_programatico; se coluna não existir, refaz sem
    let res = await supabase
      .from("aulas")
      .select("id, turma_id, data, data_aula, hora_inicio, hora_fim, conteudo_programatico, conteudo, titulo, ch_prevista, duracao")
      .in("turma_id", vincRows.map((t) => t.turma_id));
    if (res.error && /does not exist/i.test(res.error.message)) {
      res = await supabase
        .from("aulas")
        .select("*")
        .in("turma_id", vincRows.map((t) => t.turma_id));
    }
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

  // Agrupa aulas por dia (multi-turma)
  type AulaCanon = {
    turma_id: string;
    hi: string; // HH:MM
    hf: string; // HH:MM
    horas: number;
    conteudo: string;
    valor: number;
  };
  const porDia = new Map<string, AulaCanon[]>();
  for (const a of aulas) {
    const d: string = (a.data_aula ?? a.data ?? "").slice(0, 10);
    if (!d) continue;
    const meta = turmasMeta.get(a.turma_id);
    const hi = timeHM(a.hora_inicio ?? meta?.hi ?? null);
    const hf = timeHM(a.hora_fim ?? meta?.hf ?? null);
    if (!hi || !hf) continue;
    let horas = toHoras(diffMinutos(hi, hf));
    if (horas <= 0) horas = Number(a.ch_prevista ?? a.duracao ?? 0) || 0;
    if (horas <= 0) continue;
    const vh = turmaValor.get(a.turma_id) ?? valorMedio;
    const conteudo = String(a.conteudo_programatico ?? a.conteudo ?? a.titulo ?? "").trim();
    const canon: AulaCanon = {
      turma_id: a.turma_id,
      hi,
      hf,
      horas,
      conteudo,
      valor: Math.round(horas * vh * 100) / 100,
    };
    const arr = porDia.get(d);
    if (arr) arr.push(canon);
    else porDia.set(d, [canon]);
  }

  // Monta linhas por dia trabalhado (apenas dias com aula)
  const dias = Array.from(porDia.keys()).sort();
  const rows = dias.map((d) => {
    const aulasDia = porDia.get(d)!.slice().sort((x, y) => x.hi.localeCompare(y.hi));
    const primeira = aulasDia[0];
    const ultima = aulasDia[aulasDia.length - 1];
    let saida_almoco: string | null = null;
    let retorno: string | null = null;
    if (aulasDia.length >= 2) {
      saida_almoco = primeira.hf;
      retorno = aulasDia[1].hi;
    }
    const totalH = Math.round(aulasDia.reduce((s, x) => s + x.horas, 0) * 100) / 100;
    const totalV = Math.round(aulasDia.reduce((s, x) => s + x.valor, 0) * 100) / 100;
    const conteudo = aulasDia
      .map((x) => (x.conteudo ? `${x.conteudo} (${x.horas.toFixed(0)}h)` : `(${x.horas.toFixed(0)}h)`))
      .join(" + ");
    return {
      relacao_id: relacaoId,
      data: d,
      hora_entrada: primeira.hi,
      saida_almoco,
      retorno,
      hora_saida: ultima.hf,
      total_horas: totalH,
      valor_dia: totalV,
      conteudo,
    };
  });
  if (rows.length > 0) {
    // Se colunas novas ainda não foram aplicadas, faz fallback silencioso
    let ins2 = await supabase.from("relacoes_horas_itens" as any).insert(rows);
    if (ins2.error && /column .*(saida_almoco|retorno|conteudo).* does not exist/i.test(ins2.error.message)) {
      const legacy = rows.map((r) => ({
        relacao_id: r.relacao_id,
        data: r.data,
        hora_entrada: r.hora_entrada,
        hora_saida: r.hora_saida,
        total_horas: r.total_horas,
        valor_dia: r.valor_dia,
      }));
      ins2 = await supabase.from("relacoes_horas_itens" as any).insert(legacy);
    }
    if (ins2.error) throw new Error(ins2.error.message);
  }

  await recomputarTotais(relacaoId);
  return { relacaoId };
}

export async function recomputarTotais(relacaoId: string) {
  const itens = await supabase
    .from("relacoes_horas_itens" as any)
    .select("total_horas, valor_dia")
    .eq("relacao_id", relacaoId);
  if (itens.error) throw new Error(itens.error.message);
  const rows = (itens.data ?? []) as any[];
  const totalH = rows.reduce((s, r) => s + Number(r.total_horas ?? 0), 0);
  const totalV = rows.reduce((s, r) => s + Number(r.valor_dia ?? 0), 0);
  const dias = rows.filter((r) => Number(r.total_horas ?? 0) > 0).length;
  const patch: Record<string, unknown> = {
    total_horas: Math.round(totalH * 100) / 100,
    valor_total: Math.round(totalV * 100) / 100,
    dias_trabalhados: dias,
  };
  let upd = await supabase.from("relacoes_horas" as any).update(patch).eq("id", relacaoId);
  if (upd.error && /column .*dias_trabalhados.* does not exist/i.test(upd.error.message)) {
    delete patch.dias_trabalhados;
    upd = await supabase.from("relacoes_horas" as any).update(patch).eq("id", relacaoId);
  }
  if (upd.error) throw new Error(upd.error.message);
}

export async function salvarItem(item: {
  id: string;
  hora_entrada: string | null;
  saida_almoco?: string | null;
  retorno?: string | null;
  hora_saida: string | null;
  valor_hora: number;
  conteudo?: string | null;
}) {
  // Total = manhã (entrada→saida_almoco) + tarde (retorno→saida). Sem almoço, entrada→saida.
  const manha = item.saida_almoco
    ? diffMinutos(item.hora_entrada, item.saida_almoco)
    : 0;
  const tarde = item.retorno
    ? diffMinutos(item.retorno, item.hora_saida)
    : 0;
  const direto = item.saida_almoco || item.retorno ? 0 : diffMinutos(item.hora_entrada, item.hora_saida);
  const total = toHoras(manha + tarde + direto);
  const valor = Math.round(total * item.valor_hora * 100) / 100;
  const payload: Record<string, unknown> = {
    hora_entrada: item.hora_entrada,
    saida_almoco: item.saida_almoco ?? null,
    retorno: item.retorno ?? null,
    hora_saida: item.hora_saida,
    total_horas: total,
    valor_dia: valor,
  };
  if (item.conteudo !== undefined) payload.conteudo = item.conteudo;
  let res = await supabase.from("relacoes_horas_itens" as any).update(payload).eq("id", item.id);
  if (res.error && /column .*(saida_almoco|retorno|conteudo).* does not exist/i.test(res.error.message)) {
    const legacy = {
      hora_entrada: item.hora_entrada,
      hora_saida: item.hora_saida,
      total_horas: total,
      valor_dia: valor,
    };
    res = await supabase.from("relacoes_horas_itens" as any).update(legacy).eq("id", item.id);
  }
  if (res.error) throw new Error(res.error.message);
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