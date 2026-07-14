import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executarAiRouter } from "@/lib/ia.functions";

export type GuiaPasso = { n: number; acao: string; rota?: string | null };
export type GuiaIA = {
  resumo: string;
  por_que_importa?: string;
  passos: GuiaPasso[];
  proxima_acao?: { label: string; rota?: string | null } | null;
  referencias?: string[];
};

/**
 * Retorna o guia IA para uma atividade (Modo guiado). Cacheado em
 * `etapa_atividades.guia_ia`. Passe `regenerar=true` para forçar nova geração.
 */
export const orbeGuiaAtividade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      atividadeId: z.string().uuid(),
      regenerar: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data: atividade, error: e1 } = await admin
      .from("etapa_atividades")
      .select("id, etapa_id, grupo, titulo, descricao, descricao_detalhada, prazo, status, vinculo_modulo, prioridade, guia_ia")
      .eq("id", data.atividadeId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!atividade) throw new Error("Atividade não encontrada.");

    if (!data.regenerar && atividade.guia_ia) {
      return { guia: atividade.guia_ia as GuiaIA, cached: true };
    }

    const { data: etapa } = await admin
      .from("etapas")
      .select("numero, titulo, descricao, data_inicio, data_fim, status")
      .eq("id", (atividade as any).etapa_id)
      .maybeSingle();

    const ROTAS_HINT = [
      "- Financeiro: /financeiro (cotações, pagamentos, relação de horas)",
      "- Pedagógico: /pedagogico (turmas, aulas, frequência, matrículas)",
      "- MTE / AVA: /mte, /mte/ava, /mte/cronograma, /mte/evidencias",
      "- Administrativo: /administrativo (beneficiárias, cursistas)",
      "- Captação: /captacao (editais)",
      "- Relatórios: /relatorios (parcial, consolidado, listas)",
      "- Etapas / Demandas: /etapas, /minhas-demandas",
      "- Configurações: /configuracoes (locais, usuários, IA, permissões)",
    ].join("\n");

    const system = [
      "Você é o Orbe, assistente do Painel Mulheres Conectadas.",
      "Sua tarefa é gerar um GUIA operacional curto e prático para a atividade indicada,",
      "focado em COMO EXECUTAR dentro deste sistema (rotas reais listadas abaixo).",
      "Responda EXCLUSIVAMENTE em JSON válido, no formato:",
      '{"resumo":"...","por_que_importa":"...","passos":[{"n":1,"acao":"...","rota":"/..."}],"proxima_acao":{"label":"...","rota":"/..."},"referencias":["..."]}.',
      "Regras:",
      "- passos: 3 a 6 itens, numerados, começando com verbo, mencionando a rota exata quando aplicável;",
      "- proxima_acao: escolha a ação mais imediata para desbloquear a atividade agora;",
      "- referencias: cite apenas quando fizer sentido (ex.: 'DEQ', 'PMQ', 'contrato');",
      "- Se a atividade for administrativa (cotação, contrato, relatório parcial), foque no fluxo real do app.",
      "- Não invente rotas fora da lista abaixo.",
      "",
      "Rotas disponíveis:",
      ROTAS_HINT,
    ].join("\n");

    const user = [
      "ETAPA:",
      etapa ? `  Nº ${etapa.numero} — ${etapa.titulo} (${etapa.status})` : "  (sem etapa vinculada)",
      etapa?.descricao ? `  Descrição: ${etapa.descricao}` : "",
      etapa?.data_inicio || etapa?.data_fim ? `  Período: ${etapa?.data_inicio ?? "?"} → ${etapa?.data_fim ?? "?"}` : "",
      "",
      "ATIVIDADE:",
      `  Título: ${atividade.titulo}`,
      `  Grupo: ${atividade.grupo}`,
      `  Prioridade: ${(atividade as any).prioridade ?? "media"}`,
      `  Status: ${atividade.status}`,
      atividade.prazo ? `  Prazo: ${atividade.prazo}` : "",
      atividade.vinculo_modulo ? `  Vínculo (módulo): ${atividade.vinculo_modulo}` : "",
      atividade.descricao ? `  Descrição: ${atividade.descricao}` : "",
      (atividade as any).descricao_detalhada ? `  Detalhes: ${(atividade as any).descricao_detalhada}` : "",
    ].filter(Boolean).join("\n");

    const r = await executarAiRouter({
      admin,
      processo: "orbe_guia",
      mensagens: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      defaults: { max_tokens: 1400, temperatura: 0.3 },
    });

    // Extrai JSON — modelo pode devolver com cerca de código
    const texto = (r as any).texto ?? (r as any).conteudo ?? "";
    let parsed: any = null;
    try {
      const m = String(texto).match(/\{[\s\S]*\}$/);
      parsed = JSON.parse(m ? m[0] : String(texto));
    } catch {
      parsed = null;
    }
    const guia: GuiaIA = {
      resumo: String(parsed?.resumo ?? String(texto).slice(0, 800) ?? ""),
      por_que_importa: parsed?.por_que_importa ? String(parsed.por_que_importa) : undefined,
      passos: Array.isArray(parsed?.passos)
        ? parsed.passos.slice(0, 10).map((p: any, i: number) => ({
            n: Number(p?.n ?? i + 1),
            acao: String(p?.acao ?? p?.texto ?? ""),
            rota: p?.rota ? String(p.rota) : null,
          }))
        : [],
      proxima_acao: parsed?.proxima_acao
        ? {
            label: String(parsed.proxima_acao.label ?? "Abrir"),
            rota: parsed.proxima_acao.rota ? String(parsed.proxima_acao.rota) : null,
          }
        : null,
      referencias: Array.isArray(parsed?.referencias)
        ? parsed.referencias.slice(0, 8).map((x: any) => String(x))
        : [],
    };

    // Cache na atividade
    await admin
      .from("etapa_atividades")
      .update({ guia_ia: guia })
      .eq("id", data.atividadeId);

    return { guia, cached: false };
  });