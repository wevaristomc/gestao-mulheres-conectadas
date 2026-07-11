import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO_E_FINANCEIRO } from "@/lib/rbac-guard";
import { executarAiRouter } from "@/lib/ia.functions";

const Input = z.object({
  aba: z.enum(["frequencia", "pedagogico", "orcamentario", "metas"]),
  projetoNome: z.string().nullable().optional(),
  contexto: z.string().min(1).max(12_000),
});

const TITULOS: Record<string, string> = {
  frequencia: "Frequência das cursistas",
  pedagogico: "Desempenho pedagógico e qualificação",
  orcamentario: "Execução orçamentária",
  metas: "Metas do projeto",
};

export const gerarAnaliseAba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const titulo = TITULOS[data.aba] ?? "Relatório";
    const projeto = data.projetoNome ?? "não informado";

    const prompt = `Você é um analista sênior de projetos sociais no Brasil.
Aba analisada: **${titulo}**
Projeto: ${projeto}

Dados reais extraídos do banco (não invente números; se um dado faltar, registre a lacuna):

${data.contexto}

Escreva em português, em **1 parágrafo** de até ~140 palavras, com:
- diagnóstico objetivo do que os números mostram (pontos fortes e riscos),
- 2 a 3 recomendações concretas e acionáveis para a coordenação.
Não use listas numeradas nem títulos; entregue um parágrafo corrido, em Markdown.`;

    try {
      const r = await executarAiRouter({
        admin,
        processo: "analise_relatorio",
        mensagens: [{ role: "user", content: prompt }],
        defaults: { max_tokens: 700, temperatura: 0.4 },
      });
      return { text: r.content, provedor: r.provedor, modelo: r.modelo };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Falha ao gerar análise: ${msg}`);
    }
  });