import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LancamentoExtrato } from "@/lib/extrato-bancario";

export type ConciliacaoEscolha = {
  lancamentoIndex: number;
  beneficioId: string;
  score: number;
};

export function importacoesExtratoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["financeiro", "extratos", projetoId],
    enabled: !!projetoId,
    queryFn: async () => {
      if (!projetoId) return { rows: [], error: undefined as string | undefined };
      const { data, error } = await supabase
        .from("extratos_bancarios")
        .select("*, extrato_lancamentos(id, valor, tipo, conciliado)")
        .eq("projeto_id", projetoId)
        .order("criado_em", { ascending: false })
        .limit(20);
      return { rows: (data ?? []) as Array<Record<string, unknown>>, error: error?.message };
    },
  });
}

export async function importarEConciliar(input: {
  projetoId: string;
  nomeArquivo: string;
  referencia: string | null;
  lancamentos: LancamentoExtrato[];
  escolhas: ConciliacaoEscolha[];
}) {
  const { data: userData } = await supabase.auth.getUser();
  const totalCreditos = input.lancamentos
    .filter((row) => row.tipo === "credito")
    .reduce((sum, row) => sum + row.valor, 0);
  const totalDebitos = input.lancamentos
    .filter((row) => row.tipo === "debito")
    .reduce((sum, row) => sum + row.valor, 0);
  const { data: importacao, error: importError } = await supabase
    .from("extratos_bancarios")
    .insert({
      projeto_id: input.projetoId,
      nome_arquivo: input.nomeArquivo,
      mes_referencia: input.referencia ? `${input.referencia}-01` : null,
      total_lancamentos: input.lancamentos.length,
      total_creditos: totalCreditos,
      total_debitos: totalDebitos,
      importado_por: userData.user?.id ?? null,
      status: "processado",
    })
    .select("id")
    .single();
  if (importError || !importacao)
    throw new Error(importError?.message ?? "Falha ao registrar o extrato.");

  const rows = input.lancamentos.map((row) => ({
    extrato_id: importacao.id,
    projeto_id: input.projetoId,
    numero_linha: row.linha,
    data_lancamento: row.data,
    valor: row.valor,
    tipo: row.tipo,
    contraparte: row.contraparte || null,
    descricao: row.descricao || null,
    documento: row.documento || null,
    dados_originais: row.dadosOriginais,
    conciliado: false,
  }));
  const { data: lancamentosSalvos, error: lancamentosError } = await supabase
    .from("extrato_lancamentos")
    .insert(rows)
    .select("id, numero_linha, data_lancamento");
  if (lancamentosError) {
    await supabase.from("extratos_bancarios").delete().eq("id", importacao.id);
    throw new Error(lancamentosError.message);
  }

  const porLinha = new Map(
    (
      (lancamentosSalvos ?? []) as Array<{
        id: string;
        numero_linha: number;
        data_lancamento: string;
      }>
    ).map((row) => [row.numero_linha, row]),
  );
  const matches = input.escolhas.flatMap((escolha) => {
    const original = input.lancamentos[escolha.lancamentoIndex];
    const salvo = original ? porLinha.get(original.linha) : undefined;
    return salvo
      ? [
          {
            projeto_id: input.projetoId,
            lancamento_id: salvo.id,
            beneficio_id: escolha.beneficioId,
            score: escolha.score,
            status: "confirmado",
            confirmado_por: userData.user?.id ?? null,
            confirmado_em: new Date().toISOString(),
          },
        ]
      : [];
  });
  if (matches.length) {
    const { error: matchError } = await supabase.from("conciliacoes_bancarias").insert(matches);
    if (matchError)
      throw new Error(`Extrato importado, mas a conciliação falhou: ${matchError.message}`);
    await supabase
      .from("extrato_lancamentos")
      .update({ conciliado: true })
      .in(
        "id",
        matches.map((match) => match.lancamento_id),
      );
    for (const escolha of input.escolhas) {
      const lancamento = input.lancamentos[escolha.lancamentoIndex];
      if (!lancamento) continue;
      const { error } = await supabase
        .from("entregas_beneficios")
        .update({ status: "entregue", data_entrega: lancamento.data })
        .eq("id", escolha.beneficioId);
      if (error)
        throw new Error(`Conciliação salva, mas o benefício não foi atualizado: ${error.message}`);
    }
  }
  return { importacaoId: importacao.id, conciliados: matches.length };
}

export async function excluirImportacaoExtrato(id: string) {
  const { error } = await supabase.from("extratos_bancarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
