
## Diagnóstico real

O botão "Gerar análise com IA" chama `gerarAnaliseIaRelatorioInscricoes` → `executarAiRouter({ processo: "relatorio_inscricoes", ... })`. Esse roteador lê `ia_politicas` e depois lista provedores em `ia_provedores`. Confirmei no banco:

- `SELECT table_name FROM information_schema.tables WHERE table_name IN ('ia_provedores','ia_politicas','ia_logs_uso')` retorna **vazio** — nenhuma dessas tabelas existe.
- Uma busca em `docs/migrations/` mostra que **nunca houve** um `CREATE TABLE public.ia_provedores` / `ia_politicas` / `ia_logs_uso`. Só existem `INSERT` em `ia_politicas` (feature-migrations antigas), que evidentemente falharam silenciosamente na aplicação porque a tabela não existia.

Consequência: `admin.from("ia_provedores").select(...)` retorna erro/lista vazia, `executarAiRouter` lança `"Nenhum provedor de IA ativo"`, a mutation cai no `onError` e o texto nunca aparece. O mesmo problema derruba as análises das outras abas de Relatórios, o teste de provedor em Configurações → IA (que carrega a tela vazia por isso), o roteador de visão do OCR, o orbe, etc.

Não é caso de trocar para Lovable AI: o roteador BYOK que você já tem funciona — só falta o esquema que ele espera.

## Plano

Criar uma migração idempotente `docs/migrations/ia-byok-core.sql` que:

1. **Cria `public.ia_provedores`** com todas as colunas que o código já lê/escreve:
   - `id uuid PK default gen_random_uuid()`, `provedor text unique not null` (chave estável: `openai`, `anthropic`, `gemini`, `groq`, `openrouter`, ...), `nome_exibicao text`, `base_url text not null`, `api_key text` (guardada só no servidor; nunca exposta — `listarProvedores` já mascara), `ativo bool default true`, `prioridade int default 100` (menor = tenta primeiro), `modelo_padrao text`, `modelos_disponiveis jsonb` (array), `gratuito bool default false`, `criado_em/atualizado_em timestamptz`.

2. **Cria `public.ia_politicas`** com todas as colunas usadas pelas migrações antigas e pelo router:
   - `id uuid PK`, `processo text unique not null`, `descricao text`, `complexidade text`, `provedor_preferido text`, `max_tokens int`, `temperatura numeric`, `usar_fallback bool default true`, `prioridade int default 100`, `criado_em/atualizado_em timestamptz`.

3. **Cria `public.ia_logs_uso`** para telemetria:
   - `id uuid PK`, `processo text`, `provedor text`, `modelo text`, `tokens_entrada int default 0`, `tokens_saida int default 0`, `sucesso bool default true`, `erro text`, `criado_em timestamptz default now()`, mais índices por `criado_em` e `provedor`.

4. **GRANTs + RLS** para cada tabela:
   - `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role` (as `.functions.ts` acessam via `getSupabaseAdmin()`, mas RLS precisa existir).
   - `ENABLE ROW LEVEL SECURITY` e política única "coordenação/financeiro lê/escreve" usando `has_role_any(auth.uid(), ARRAY['coordenador_geral','administrativo','gestor_financeiro','coordenador_pedagogico'])`. `ia_logs_uso` também permite `INSERT` para service_role (para logging server-side).
   - **Nunca** expor `api_key` a `authenticated` pela Data API: manter uma view auxiliar não é necessário porque toda leitura pelo cliente passa por `listarProvedores`, que já mascara; ainda assim marcar essa coluna com uma política que só coordenação/service_role possa ler mantém defesa em profundidade.

5. **Trigger `atualizado_em`** com `public.update_updated_at_column` (função que já existe).

6. **Seeds mínimos** (via `INSERT ... ON CONFLICT DO NOTHING`), só de metadados — sem `api_key`:
   - `openai` (`https://api.openai.com/v1`, modelo padrão `gpt-4o-mini`, modelos disponíveis básicos),
   - `anthropic` (`https://api.anthropic.com/v1`, `claude-3-5-haiku-latest`),
   - `gemini` (`https://generativelanguage.googleapis.com/v1beta`, `gemini-2.5-flash`, `gratuito=true`),
   - `groq` (`https://api.groq.com/openai/v1`, `llama-3.1-70b-versatile`, `gratuito=true`),
   - `openrouter` (`https://openrouter.ai/api/v1`, `openai/gpt-4o-mini`).
   Assim os cards aparecem em Configurações → IA prontos para você colar sua chave.

7. **Reaplicar os INSERTs de políticas** que ficaram órfãos (`relatorio_inscricoes`, `analise_relatorio`, `relatorio_parcial_objeto`, `orbe`, `leitor_lista_presenca`, etc.). A migração inclui `INSERT ... ON CONFLICT (processo) DO NOTHING` para as políticas conhecidas do repositório, para não depender das antigas serem reexecutadas.

## Como usar depois da migração

1. Abrir **Configurações → IA**.
2. No card do provedor desejado (ex.: OpenAI), colar a `api_key`, escolher o modelo e clicar **Testar**. O botão hoje já usa `testarProvedor` e vai exibir a resposta OK/erro.
3. Se quiser, ajustar a **Política de Cadência** para forçar `relatorio_inscricoes` a usar seu provedor preferido.
4. Voltar em Administrativo → Inscrições → **Gerar análise com IA**. O `executarAiRouter` agora encontra o provedor ativo, roda a chamada e o parágrafo aparece no bloco "Análise da IA".

## Fora de escopo (nesta rodada)

- Nada é mudado na UI, no `AnaliseIA` ou no `ia.functions.ts`; a lógica atual já está correta uma vez que o esquema exista.
- Nenhuma chamada a Lovable AI Gateway (`LOVABLE_API_KEY`).
- Nenhum mock de resposta.
