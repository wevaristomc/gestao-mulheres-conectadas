import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProjetoIdSchema = z.string().uuid();

const SalvarProjetoSchema = z.object({
  projetoId: ProjetoIdSchema,
  payload: z.object({
    nome: z.string().nullable(),
    vigencia_inicio: z.string().nullable(),
    vigencia_fim: z.string().nullable(),
    valor_global: z.number().nullable(),
    custo_aluno_hora: z.number().nullable(),
    executora_nome: z.string().nullable(),
    cnpj: z.string().nullable(),
    endereco: z.string().nullable(),
  }),
});

export type ProjetoConfiguracoesRow = Record<string, unknown> & {
  id: string;
  nome: string;
};

export const carregarProjetoConfiguracoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projetoId: ProjetoIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("projetos")
      .select("*")
      .eq("id", data.projetoId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (row ?? null) as ProjetoConfiguracoesRow | null;
  });

export const salvarProjetoConfiguracoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SalvarProjetoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: role, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("projeto_id", data.projetoId)
      .eq("role", "coordenador_geral")
      .maybeSingle();

    if (roleError) throw new Error(roleError.message);
    if (!role) throw new Error("Apenas Coordenação Geral pode salvar as configurações do projeto.");

    const payload: Record<string, unknown> = { ...data.payload };
    if (!payload.nome) payload.nome = data.payload.nome ?? "";

    const removidos: string[] = [];
    let attempts = 0;
    while (attempts < 10) {
      if (Object.keys(payload).length === 0) {
        throw new Error("Nenhuma coluna de configuração existe na tabela de projetos.");
      }

      const res = await context.supabase
        .from("projetos")
        .update(payload)
        .eq("id", data.projetoId);

      if (!res.error) return { removidos };

      const msg = res.error.message;
      const missing = /column "?([a-zA-Z0-9_]+)"? .* does not exist/i.exec(msg);
      if (missing?.[1] && missing[1] in payload) {
        delete payload[missing[1]];
        removidos.push(missing[1]);
        attempts += 1;
        continue;
      }

      throw new Error(msg);
    }

    throw new Error("Não foi possível salvar as configurações do projeto.");
  });