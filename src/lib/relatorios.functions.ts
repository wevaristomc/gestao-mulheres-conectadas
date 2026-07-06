import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  projetoId: z.string().uuid(),
  resumo: z.object({
    projetoNome: z.string().nullable(),
    dataInicio: z.string().nullable(),
    dataFim: z.string().nullable(),
    diasRestantes: z.number().nullable(),
    valorGlobal: z.number().nullable(),
    turmas: z.number().nullable(),
    cursistasAtivas: z.number().nullable(),
    aulasRealizadas: z.number().nullable(),
    aulasPrevistas: z.number().nullable(),
    frequenciaMedia: z.number().nullable(),
    orcamentoPrevisto: z.number().nullable(),
    orcamentoExecutado: z.number().nullable(),
    orcamentoPct: z.number().nullable(),
  }),
});

export const gerarRelatorioInteligente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const r = data.resumo;
    const fmtN = (n: number | null) => (n === null ? "não disponível" : String(n));
    const fmtP = (n: number | null) => (n === null ? "não disponível" : `${n.toFixed(1)}%`);
    const fmtM = (n: number | null) =>
      n === null ? "não disponível" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

    const prompt = `Você é um analista sênior de projetos sociais. Com base nos indicadores abaixo, gere um parecer executivo em português (Markdown), objetivo, com:
1. Panorama do projeto (2-3 linhas).
2. Pontos fortes.
3. Riscos e alertas (frequência baixa, execução lenta, prazos apertados).
4. Recomendações concretas (3 a 5 itens acionáveis).

Indicadores do projeto:
- Projeto: ${r.projetoNome ?? "não informado"}
- Vigência: ${r.dataInicio ?? "?"} até ${r.dataFim ?? "?"} (dias restantes: ${fmtN(r.diasRestantes)})
- Valor global: ${fmtM(r.valorGlobal)}
- Turmas cadastradas: ${fmtN(r.turmas)}
- Cursistas ativas (matrículas): ${fmtN(r.cursistasAtivas)}
- Aulas realizadas / previstas: ${fmtN(r.aulasRealizadas)} / ${fmtN(r.aulasPrevistas)}
- Frequência média: ${fmtP(r.frequenciaMedia)}
- Orçamento previsto: ${fmtM(r.orcamentoPrevisto)}
- Orçamento executado: ${fmtM(r.orcamentoExecutado)} (${fmtP(r.orcamentoPct)})

Não invente números. Se um indicador estiver "não disponível", registre a lacuna e recomende preencher.`;

    try {
      const { text } = await generateText({ model, prompt });
      return { text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Falha ao gerar relatório: ${msg}`);
    }
  });