// Seed de pendências do Ofício SEI nº 49148/2026 (doc. 9151564,
// Processo 19968.200342/2025-94). Idempotente: identifica cada item
// pelo `payload->>titulo` e por um `payload->>fonte` fixo.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FONTE_OFICIO_49148 = "oficio-49148-2026";

export type PrioridadeOficio = "CRITICA" | "ALTA" | "MEDIA";
export type StatusOficio = "aberta" | "em_andamento" | "resolvida";

export type PendenciaOficioSeed = {
  titulo: string;
  origem: string;
  setor: string;
  responsavel: string;
  prazo: string; // ISO YYYY-MM-DD
  prioridade: PrioridadeOficio;
  status: StatusOficio;
};

export const PENDENCIAS_OFICIO_49148: PendenciaOficioSeed[] = [
  {
    titulo: "Enviar fichas de inscrição via SEI/MTE e TransfereGov",
    origem: "Ofício 49148/2026 — item i",
    setor: "Secretaria / Pedagógico",
    responsavel: "Daiane Gomes",
    prazo: "2026-07-14",
    prioridade: "CRITICA",
    status: "aberta",
  },
  {
    titulo:
      "Enviar listas de entrega assinadas (kits, material pedagógico, camisetas, alimentação, transporte)",
    origem: "Ofício 49148/2026 — item i",
    setor: "Coordenação local",
    responsavel: "Professores + polos",
    prazo: "2026-07-14",
    prioridade: "CRITICA",
    status: "aberta",
  },
  {
    titulo: "Enviar listas de presença desde 09/05/2026",
    origem: "Documento SEI 9151523",
    setor: "Pedagógico",
    responsavel: "Professores",
    prazo: "2026-07-14",
    prioridade: "CRITICA",
    status: "aberta",
  },
  {
    titulo: "Cronograma completo das 12 turmas no modelo MTE",
    origem: "Ofício 49148/2026 — item ii",
    setor: "Coordenação Geral",
    responsavel: "Weverton Menezes",
    prazo: "2026-07-11",
    prioridade: "CRITICA",
    status: "em_andamento",
  },
  {
    titulo:
      "Anexar documentação no TransfereGov (PDF pesquisável, sem links externos)",
    origem: "Orientações DEQ",
    setor: "Administrativo",
    responsavel: "Weverton Menezes",
    prazo: "2026-07-14",
    prioridade: "CRITICA",
    status: "aberta",
  },
  {
    titulo: "Agendar reunião com MTE (passagens compradas com 30 dias)",
    origem: "Ofício 49148/2026",
    setor: "Presidência",
    responsavel: "Sérgio José de Souza",
    prazo: "2026-07-10",
    prioridade: "ALTA",
    status: "aberta",
  },
  {
    titulo:
      "Completar nascimento, gênero, raça/cor e PCD das beneficiárias",
    origem: "DEQ — item V",
    setor: "Secretaria",
    responsavel: "Secretaria",
    prazo: "2026-07-13",
    prioridade: "ALTA",
    status: "aberta",
  },
  {
    titulo: "Consolidar frequência e benefícios por turma",
    origem: "DEQ — item VI",
    setor: "Pedagógico + Financeiro",
    responsavel: "Coordenação pedagógica",
    prazo: "2026-07-14",
    prioridade: "ALTA",
    status: "aberta",
  },
  {
    titulo:
      "Corrigir matrículas AVA: JBT-MC-01 (152), JBT-MC-02 (3), BET-MC-01 (23)",
    origem: "Auditoria interna",
    setor: "TI / AVA",
    responsavel: "Wagner Oliveira",
    prazo: "2026-07-11",
    prioridade: "ALTA",
    status: "aberta",
  },
  {
    titulo: "Resolver 3 CPFs inválidos e 3 CPFs duplicados",
    origem: "Auditoria interna",
    setor: "Secretaria",
    responsavel: "Secretaria",
    prazo: "2026-07-13",
    prioridade: "ALTA",
    status: "aberta",
  },
  {
    titulo: "Regularizar 17 contas bancárias e 118 assinaturas pendentes",
    origem: "DEQ — item VI",
    setor: "Financeiro",
    responsavel: "Financeiro",
    prazo: "2026-07-17",
    prioridade: "ALTA",
    status: "aberta",
  },
  {
    titulo:
      "Evidências de identidade visual PMQ (fotos, certificados, camisetas)",
    origem: "DEQ — item VII",
    setor: "Comunicação",
    responsavel: "Equipe de mídia",
    prazo: "2026-07-14",
    prioridade: "MEDIA",
    status: "aberta",
  },
  {
    titulo: "Relatório Parcial de Execução do Objeto",
    origem: "DEQ — item I",
    setor: "Coordenação Geral",
    responsavel: "Weverton Menezes",
    prazo: "2026-07-17",
    prioridade: "ALTA",
    status: "em_andamento",
  },
  {
    titulo:
      "Completar ~30 vagas para meta de 300 no Ciclo 1 (270 ativas) ou justificar",
    origem: "Plano de Trabalho",
    setor: "Mobilização",
    responsavel: "Coordenação geral",
    prazo: "2026-07-20",
    prioridade: "MEDIA",
    status: "aberta",
  },
];

export type ResumoSeedOficio = {
  criadas: number;
  existentes: number;
  total: number;
  inconsistencias: string[];
};

export const carregarPendenciasOficio49148 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumoSeedOficio> => {
    // Autorização — coordenador_geral
    const roleQ = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "coordenador_geral")
      .limit(1)
      .maybeSingle();
    if (roleQ.error) throw new Error(roleQ.error.message);
    if (!roleQ.data) {
      throw new Error(
        "Apenas a coordenação geral pode carregar as pendências do Ofício 49148/2026.",
      );
    }

    const { getSupabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const admin = getSupabaseAdmin();

    const resumo: ResumoSeedOficio = {
      criadas: 0,
      existentes: 0,
      total: PENDENCIAS_OFICIO_49148.length,
      inconsistencias: [],
    };

    // Busca pendências já criadas por esta seed (payload->>fonte = FONTE_OFICIO_49148)
    const existQ = await admin
      .from("pendencias")
      .select("id, payload")
      .eq("payload->>fonte", FONTE_OFICIO_49148)
      .limit(500);
    if (existQ.error) throw new Error(`pendencias SELECT: ${existQ.error.message}`);

    const jaCriadas = new Set<string>();
    for (const row of (existQ.data ?? []) as Array<{ payload: Record<string, unknown> | null }>) {
      const t = row.payload?.["titulo"];
      if (typeof t === "string") jaCriadas.add(t.trim().toLowerCase());
    }

    const novas: Array<{ status: string; payload: Record<string, unknown> }> = [];
    for (const p of PENDENCIAS_OFICIO_49148) {
      const key = p.titulo.trim().toLowerCase();
      if (jaCriadas.has(key)) {
        resumo.existentes += 1;
        continue;
      }
      novas.push({
        status: p.status,
        payload: {
          fonte: FONTE_OFICIO_49148,
          titulo: p.titulo,
          origem: p.origem,
          setor: p.setor,
          responsavel: p.responsavel,
          prazo: p.prazo,
          prioridade: p.prioridade,
          processo_sei: "19968.200342/2025-94",
          documento_sei: "9151564",
        },
      });
    }

    if (novas.length > 0) {
      const ins = await admin.from("pendencias").insert(novas);
      if (ins.error) throw new Error(`pendencias INSERT: ${ins.error.message}`);
      resumo.criadas = novas.length;
    }

    return resumo;
  });