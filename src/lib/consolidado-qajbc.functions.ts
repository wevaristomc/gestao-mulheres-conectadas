// Importação Consolidada QAJBC — Programa Manuel Querino / Mulheres Conectadas.
// Cria/atualiza turmas, beneficiárias, matrículas e vincula ava_users a partir
// do seed embarcado em src/data/seed-consolidado.ts. Idempotente.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO } from "@/lib/rbac-guard";
import {
  ALUNAS_SEED,
  NOME_CURSO_CONSOLIDADO,
  PROFESSORES_SEED,
  TURMAS_SEED,
} from "@/data/seed-consolidado";

export type ResumoConsolidado = {
  turmas_criadas: number;
  turmas_atualizadas: number;
  beneficiarias_criadas: number;
  beneficiarias_atualizadas: number;
  matriculas_criadas: number;
  matriculas_atualizadas: number;
  vinculos_ava_por_moodle_id: number;
  vinculos_ava_por_cpf: number;
  professores_vinculados: number;
  cpfs_invalidos: number;
  cpfs_duplicados: number;
  cursistas_criados: number;
  cursistas_atualizados: number;
  aulas_criadas: number;
  turmas_com_projeto: number;
  inconsistencias: string[];
};

export const importarConsolidadoQajbc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((data: { projeto_id?: string | null } | undefined) => {
    const projeto_id = data?.projeto_id ?? null;
    if (projeto_id !== null && typeof projeto_id !== "string") {
      throw new Error("projeto_id inválido");
    }
    return { projeto_id };
  })
  .handler(async ({ data, context }): Promise<ResumoConsolidado> => {
    const projetoId = data.projeto_id;
    // 1. Autorização
    const roleQ = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "coordenador_geral")
      .limit(1)
      .maybeSingle();
    if (roleQ.error) throw new Error(roleQ.error.message);
    if (!roleQ.data) {
      throw new Error("Apenas a coordenação geral pode rodar a importação consolidada.");
    }
    if (!projetoId) {
      throw new Error(
        "Selecione o projeto ativo (Manuel Querino / Mulheres Conectadas) no topo antes de rodar a importação.",
      );
    }

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const resumo: ResumoConsolidado = {
      turmas_criadas: 0,
      turmas_atualizadas: 0,
      beneficiarias_criadas: 0,
      beneficiarias_atualizadas: 0,
      matriculas_criadas: 0,
      matriculas_atualizadas: 0,
      vinculos_ava_por_moodle_id: 0,
      vinculos_ava_por_cpf: 0,
      professores_vinculados: 0,
      cpfs_invalidos: 0,
      cpfs_duplicados: 0,
      cursistas_criados: 0,
      cursistas_atualizados: 0,
      aulas_criadas: 0,
      turmas_com_projeto: 0,
      inconsistencias: [],
    };

    // ============================ 2. Turmas ============================
    // Mapa codigo → id. Também mapa código → nome do professor titular.
    const profPorTurma = new Map<string, { nome: string; email: string }>();
    for (const p of PROFESSORES_SEED) {
      for (const cod of p.turmas) {
        profPorTurma.set(cod, { nome: p.nome, email: p.email });
      }
    }

    const turmaIdPorCodigo = new Map<string, string>();

    for (const t of TURMAS_SEED) {
      const prof = profPorTurma.get(t.codigo_turma);
      const payload: Record<string, unknown> = {
        executora: "QUINTA ARTE",
        nome_curso: NOME_CURSO_CONSOLIDADO,
        codigo_turma: t.codigo_turma,
        turno: t.turno,
        horario_realizacao: t.horario_realizacao,
        ch_conhecimentos_gerais: 0,
        ch_conhecimentos_especificos: 150,
        ch_total: 150,
        vagas: 50,
        data_inicio: "2026-05-09",
        municipio: t.municipio,
        ciclo: 1,
        professor_nome: prof?.nome ?? null,
        professor_email: prof?.email ?? null,
        projeto_id: projetoId,
      };

      // Busca existente por código (case-insensitive)
      const existQ = await admin
        .from("turmas")
        .select("id, codigo_turma")
        .ilike("codigo_turma", t.codigo_turma)
        .limit(1)
        .maybeSingle();
      if (existQ.error) throw new Error(`turmas SELECT: ${existQ.error.message}`);

      if (existQ.data) {
        const upd = await admin
          .from("turmas")
          .update(payload)
          .eq("id", (existQ.data as { id: string }).id);
        if (upd.error) {
          // Se a coluna professor_nome/email não existir, tenta sem esses campos
          if (/professor_(nome|email)|projeto_id/i.test(upd.error.message)) {
            if (/professor_(nome|email)/i.test(upd.error.message)) {
              delete payload.professor_nome;
              delete payload.professor_email;
              resumo.inconsistencias.push(
                "Colunas professor_nome/professor_email não existem em turmas — rode a migração docs/migrations/consolidado-qajbc.sql.",
              );
            }
            if (/projeto_id/i.test(upd.error.message)) {
              delete payload.projeto_id;
              resumo.inconsistencias.push(
                "Coluna projeto_id não existe em turmas — dados não aparecerão em Pedagógico/Administrativo/Relatórios.",
              );
            }
            const upd2 = await admin.from("turmas").update(payload).eq("id", (existQ.data as { id: string }).id);
            if (upd2.error) throw new Error(`turmas UPDATE: ${upd2.error.message}`);
          } else {
            throw new Error(`turmas UPDATE: ${upd.error.message}`);
          }
        }
        turmaIdPorCodigo.set(t.codigo_turma, (existQ.data as { id: string }).id);
        resumo.turmas_atualizadas += 1;
        if ("projeto_id" in payload) resumo.turmas_com_projeto += 1;
      } else {
        let ins = await admin.from("turmas").insert(payload).select("id").single();
        while (
          ins.error &&
          /professor_(nome|email)|projeto_id/i.test(ins.error.message)
        ) {
          if (/professor_(nome|email)/i.test(ins.error.message)) {
            delete payload.professor_nome;
            delete payload.professor_email;
            resumo.inconsistencias.push(
              "Colunas professor_nome/professor_email não existem em turmas — rode a migração docs/migrations/consolidado-qajbc.sql.",
            );
          }
          if (/projeto_id/i.test(ins.error.message)) {
            delete payload.projeto_id;
            resumo.inconsistencias.push(
              "Coluna projeto_id não existe em turmas — dados não aparecerão em Pedagógico/Administrativo/Relatórios.",
            );
          }
          ins = await admin.from("turmas").insert(payload).select("id").single();
        }
        if (ins.error) throw new Error(`turmas INSERT: ${ins.error.message}`);
        turmaIdPorCodigo.set(t.codigo_turma, (ins.data as { id: string }).id);
        resumo.turmas_criadas += 1;
        if ("projeto_id" in payload) resumo.turmas_com_projeto += 1;
      }
    }

    if (profPorTurma.size > 0 && !resumo.inconsistencias.some((s) => s.includes("professor_nome"))) {
      resumo.professores_vinculados = profPorTurma.size;
    }

    // ========================= 3. Beneficiárias =========================
    // Deduplicação por CPF (dígitos). Para inválidos, usa cpf_raw como chave.
    type Agg = {
      chave: string;               // valor final gravado em beneficiarias.cpf
      nome: string;
      banco: string | null;
      agencia: string | null;
      conta: string | null;
      cpf_valido: boolean;
      turmas: Array<{ turma: string; assinou_lista: boolean; observacao: string | null }>;
      nomes_alternativos: Set<string>;
    };
    const porCpf = new Map<string, Agg>();

    for (const a of ALUNAS_SEED) {
      const chave = a.cpf_valido ? a.cpf : `INVALIDO-${a.cpf_raw || a.nome}`;
      let agg = porCpf.get(chave);
      if (!agg) {
        agg = {
          chave,
          nome: a.nome,
          banco: a.banco,
          agencia: a.agencia,
          conta: a.conta,
          cpf_valido: a.cpf_valido,
          turmas: [],
          nomes_alternativos: new Set(),
        };
        porCpf.set(chave, agg);
      } else {
        agg.nomes_alternativos.add(a.nome);
        // completa dados bancários se estavam vazios
        agg.banco = agg.banco ?? a.banco;
        agg.agencia = agg.agencia ?? a.agencia;
        agg.conta = agg.conta ?? a.conta;
      }
      agg.turmas.push({
        turma: a.turma,
        assinou_lista: a.assinou_lista,
        observacao: a.observacao_csv,
      });
      if (!a.cpf_valido) resumo.cpfs_invalidos += 1;
    }

    // Conta duplicados (CPFs que apareceram em mais de uma turma)
    for (const agg of porCpf.values()) {
      if (agg.turmas.length > 1) resumo.cpfs_duplicados += 1;
    }

    // Upsert das beneficiárias
    const chaveParaBenefId = new Map<string, string>();

    for (const agg of porCpf.values()) {
      const observacoesArr: string[] = [];
      if (!agg.cpf_valido) observacoesArr.push("CPF inválido – conferir documento");
      if (agg.turmas.length > 1) observacoesArr.push("CPF duplicado entre turmas – definir turma única");
      if (agg.nomes_alternativos.size > 0) {
        observacoesArr.push(`Nomes variantes no CSV: ${[...agg.nomes_alternativos].join(" | ")}`);
      }

      const payload: Record<string, unknown> = {
        nome: agg.nome,
        cpf: agg.chave,
        banco: agg.banco,
        agencia: agg.agencia,
        conta: agg.conta,
      };
      if (observacoesArr.length > 0) {
        // Beneficiaria schema não tem "observacoes" no MTE-queries mas pode existir no DB.
        payload.observacoes = observacoesArr.join(" · ");
      }

      const existQ = await admin
        .from("beneficiarias")
        .select("id")
        .eq("cpf", agg.chave)
        .limit(1)
        .maybeSingle();
      if (existQ.error) throw new Error(`beneficiarias SELECT: ${existQ.error.message}`);

      if (existQ.data) {
        const upd = await admin
          .from("beneficiarias")
          .update(payload)
          .eq("id", (existQ.data as { id: string }).id);
        if (upd.error && /observacoes/i.test(upd.error.message)) {
          delete payload.observacoes;
          const upd2 = await admin.from("beneficiarias").update(payload).eq("id", (existQ.data as { id: string }).id);
          if (upd2.error) throw new Error(`beneficiarias UPDATE: ${upd2.error.message}`);
        } else if (upd.error) {
          throw new Error(`beneficiarias UPDATE: ${upd.error.message}`);
        }
        chaveParaBenefId.set(agg.chave, (existQ.data as { id: string }).id);
        resumo.beneficiarias_atualizadas += 1;
      } else {
        let ins = await admin.from("beneficiarias").insert(payload).select("id").single();
        if (ins.error && /observacoes/i.test(ins.error.message)) {
          delete payload.observacoes;
          ins = await admin.from("beneficiarias").insert(payload).select("id").single();
        }
        if (ins.error) throw new Error(`beneficiarias INSERT: ${ins.error.message}`);
        chaveParaBenefId.set(agg.chave, (ins.data as { id: string }).id);
        resumo.beneficiarias_criadas += 1;
      }
    }

    // =========================== 4. Matrículas ==========================
    // 4a. Espelho de beneficiárias em `cursistas` (best-effort). O Pedagógico
    // e o Administrativo leem `matriculas.cursista_id → cursistas(*)`, por isso
    // além do vínculo MTE (beneficiaria_id) precisamos escrever cursista_id.
    const chaveParaCursistaId = new Map<string, string>();
    let cursistasIndisponivel = false;
    for (const agg of porCpf.values()) {
      const cursistaPayload: Record<string, unknown> = {
        nome: agg.nome,
        cpf: agg.chave,
      };
      const existQ = await admin
        .from("cursistas")
        .select("id")
        .eq("cpf", agg.chave)
        .limit(1)
        .maybeSingle();
      if (existQ.error) {
        // tabela ou coluna ausente — degrada silenciosamente
        cursistasIndisponivel = true;
        break;
      }
      if (existQ.data) {
        const upd = await admin
          .from("cursistas")
          .update(cursistaPayload)
          .eq("id", (existQ.data as { id: string }).id);
        if (!upd.error) {
          chaveParaCursistaId.set(agg.chave, (existQ.data as { id: string }).id);
          resumo.cursistas_atualizados += 1;
        }
      } else {
        const ins = await admin.from("cursistas").insert(cursistaPayload).select("id").single();
        if (!ins.error) {
          chaveParaCursistaId.set(agg.chave, (ins.data as { id: string }).id);
          resumo.cursistas_criados += 1;
        }
      }
    }
    if (cursistasIndisponivel) {
      resumo.inconsistencias.push(
        "Tabela `cursistas` indisponível — alunas aparecerão só no MTE. Habilite a tabela ou rode a migração para desbloquear Pedagógico/Administrativo.",
      );
    }

    // Pega existentes para diferenciar criadas × atualizadas
    const matExistentes = new Set<string>();
    {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from("matriculas")
          .select("turma_id, beneficiaria_id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`matriculas SELECT: ${error.message}`);
        const rows = (data ?? []) as { turma_id: string; beneficiaria_id: string }[];
        for (const r of rows) matExistentes.add(`${r.turma_id}::${r.beneficiaria_id}`);
        if (rows.length < PAGE) break;
      }
    }

    type MatPayload = {
      turma_id: string;
      beneficiaria_id: string;
      cursista_id?: string | null;
      status: string;
      assinou_lista: boolean;
      observacao_importacao: string | null;
      data_inscricao: string;
    };
    const matDedup = new Map<string, MatPayload>();

    for (const agg of porCpf.values()) {
      const benefId = chaveParaBenefId.get(agg.chave);
      if (!benefId) continue;
      const cursistaId = chaveParaCursistaId.get(agg.chave) ?? null;
      for (const t of agg.turmas) {
        const turmaId = turmaIdPorCodigo.get(t.turma);
        if (!turmaId) {
          resumo.inconsistencias.push(`Turma desconhecida no CSV: ${t.turma}`);
          continue;
        }
        const chave = `${turmaId}::${benefId}`;
        matDedup.set(chave, {
          turma_id: turmaId,
          beneficiaria_id: benefId,
          cursista_id: cursistaId,
          status: "cursando",
          assinou_lista: t.assinou_lista,
          observacao_importacao: t.observacao,
          data_inscricao: "2026-05-09",
        });
      }
    }

    const matRows = [...matDedup.values()];
    let matriculaSemCursistaId = false;
    for (let k = 0; k < matRows.length; k += 500) {
      const slice = matRows.slice(k, k + 500);
      let { error } = await admin
        .from("matriculas")
        .upsert(slice, { onConflict: "turma_id,beneficiaria_id" });
      if (error && /cursista_id/i.test(error.message)) {
        matriculaSemCursistaId = true;
        const stripped = slice.map(({ cursista_id: _c, ...rest }) => rest);
        const retry = await admin
          .from("matriculas")
          .upsert(stripped, { onConflict: "turma_id,beneficiaria_id" });
        error = retry.error;
      }
      if (error) throw new Error(`matriculas UPSERT: ${error.message}`);
      for (const r of slice) {
        if (matExistentes.has(`${r.turma_id}::${r.beneficiaria_id}`)) resumo.matriculas_atualizadas += 1;
        else resumo.matriculas_criadas += 1;
      }
    }
    if (matriculaSemCursistaId) {
      resumo.inconsistencias.push(
        "Coluna `matriculas.cursista_id` não existe — rode docs/migrations/consolidado-pedagogico.sql para o Pedagógico/Administrativo verem as alunas.",
      );
    }

    // =========================== 5. AVA links ===========================
    // Preferência: vincular ava_users por moodle_id explícito do CSV;
    // depois, os demais que ainda não têm beneficiaria_id, tentam por CPF.

    for (const a of ALUNAS_SEED) {
      if (!a.ava_moodle_id) continue;
      const chave = a.cpf_valido ? a.cpf : `INVALIDO-${a.cpf_raw || a.nome}`;
      const benefId = chaveParaBenefId.get(chave);
      if (!benefId) continue;
      const { error } = await admin
        .from("ava_users")
        .update({ beneficiaria_id: benefId })
        .eq("moodle_id", a.ava_moodle_id);
      if (!error) resumo.vinculos_ava_por_moodle_id += 1;
    }

    // Vincular por CPF os que ainda estão sem beneficiaria_id
    {
      const cpfs = [...chaveParaBenefId.keys()].filter((k) => !k.startsWith("INVALIDO-"));
      if (cpfs.length > 0) {
        const PAGE = 500;
        for (let i = 0; i < cpfs.length; i += PAGE) {
          const slice = cpfs.slice(i, i + PAGE);
          const { data, error } = await admin
            .from("ava_users")
            .select("moodle_id, cpf")
            .in("cpf", slice)
            .is("beneficiaria_id", null);
          if (error) continue;
          for (const u of (data ?? []) as { moodle_id: number; cpf: string }[]) {
            const bid = chaveParaBenefId.get(u.cpf);
            if (!bid) continue;
            const upd = await admin
              .from("ava_users")
              .update({ beneficiaria_id: bid })
              .eq("moodle_id", u.moodle_id);
            if (!upd.error) resumo.vinculos_ava_por_cpf += 1;
          }
        }
      }
    }

    // ============ 6. Esqueleto de aulas (30 aulas × 5h = 150h) ============
    // Só cria se a turma ainda não tem aulas — idempotente e defensivo se a
    // tabela não existir. Gera 30 datas em dias úteis a partir de 2026-05-09.
    function gerarDatasDiasUteis(inicioISO: string, qtd: number): string[] {
      const out: string[] = [];
      const [y, m, d] = inicioISO.split("-").map(Number);
      const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
      // Se cair no fim de semana, avança para segunda
      while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) {
        dt.setUTCDate(dt.getUTCDate() + 1);
      }
      while (out.length < qtd) {
        const dow = dt.getUTCDay();
        if (dow !== 0 && dow !== 6) {
          out.push(dt.toISOString().slice(0, 10));
        }
        dt.setUTCDate(dt.getUTCDate() + 1);
      }
      return out;
    }

    const QTD_AULAS = 30;
    const DURACAO_H = 5;
    let aulasIndisponivel = false;
    for (const [codigo, turmaId] of turmaIdPorCodigo.entries()) {
      // já tem aulas?
      const { count, error: cErr } = await admin
        .from("aulas")
        .select("id", { count: "exact", head: true })
        .eq("turma_id", turmaId);
      if (cErr) {
        aulasIndisponivel = true;
        continue;
      }
      if ((count ?? 0) > 0) continue;

      const datas = gerarDatasDiasUteis("2026-05-09", QTD_AULAS);
      const rows = datas.map((data, i) => ({
        turma_id: turmaId,
        data,
        titulo: `Aula ${String(i + 1).padStart(2, "0")} — ${codigo}`,
        duracao: DURACAO_H,
        ordem: i + 1,
      }));
      // tentativa completa
      let ins = await admin.from("aulas").insert(rows);
      // fallback progressivo removendo colunas ausentes
      const removerColuna = (nome: "titulo" | "duracao" | "ordem") => {
        for (const r of rows) delete (r as Record<string, unknown>)[nome];
      };
      let tentativas = 0;
      while (ins.error && tentativas < 4) {
        const msg = ins.error.message;
        if (/column .*ordem/i.test(msg)) removerColuna("ordem");
        else if (/column .*duracao/i.test(msg)) removerColuna("duracao");
        else if (/column .*titulo/i.test(msg)) removerColuna("titulo");
        else break;
        ins = await admin.from("aulas").insert(rows);
        tentativas += 1;
      }
      if (ins.error) {
        aulasIndisponivel = true;
        continue;
      }
      resumo.aulas_criadas += rows.length;
    }
    if (aulasIndisponivel) {
      resumo.inconsistencias.push(
        "Não foi possível criar o esqueleto de aulas em todas as turmas — confirme se a tabela `aulas` existe com colunas turma_id/data.",
      );
    }

    return resumo;
  });