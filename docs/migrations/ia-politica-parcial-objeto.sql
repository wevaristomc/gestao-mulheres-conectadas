-- Fase 3b — Política de IA para geração assistida das seções do
-- Relatório Parcial de Execução do Objeto (DEQ_FISCAL Item I).
-- Idempotente, aditivo. Aplica no banco REAL (yqvocpnvunaprpmhlswn).
-- NÃO usa Lovable Cloud.
--
-- Confere:
--   * `ia_politicas` já existe (usado por leitor de lista, orbe etc.).
--   * `executarAiRouter('relatorio_parcial_objeto', ...)` lê esta linha para
--     escolher provedor preferido/max_tokens/temperatura/fallback.
--   * A geração é sempre chamada por server function autenticada; o texto
--     produzido é SEMPRE tratado como proposta ("Gerado por IA — revisar
--     antes de enviar ao SEI/TransfereGov").

INSERT INTO public.ia_politicas (processo, descricao, prioridade, provedor_preferido, max_tokens, temperatura, usar_fallback)
VALUES (
  'relatorio_parcial_objeto',
  'Geração assistida das seções do Relatório Parcial de Execução do Objeto (DEQ Item I) com RAG sobre documentos_chunks.',
  'alta',
  'gemini',
  4096,
  0.4,
  true
)
ON CONFLICT (processo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  provedor_preferido = COALESCE(public.ia_politicas.provedor_preferido, EXCLUDED.provedor_preferido),
  max_tokens = GREATEST(COALESCE(public.ia_politicas.max_tokens, 0), EXCLUDED.max_tokens),
  temperatura = COALESCE(public.ia_politicas.temperatura, EXCLUDED.temperatura),
  usar_fallback = COALESCE(public.ia_politicas.usar_fallback, EXCLUDED.usar_fallback);
