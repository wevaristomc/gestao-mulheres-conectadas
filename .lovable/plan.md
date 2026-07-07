## Objetivo

Todos os recursos de IA do sistema — resumos, análises e processamento de mídias — passarão a usar exclusivamente os provedores cadastrados em **Configurações → IA** (OpenRouter, Groq, OpenAI, Anthropic, Gemini etc.), com fallback automático conforme a política já existente. O erro `AI_APICallError: Payment Required` desaparece porque o Lovable Gateway deixa de ser chamado.

## O que muda hoje

Hoje três lugares batem direto no Lovable Gateway:

| Local | Função | Tipo |
|---|---|---|
| `src/lib/relatorios.functions.ts` | `gerarAnaliseAba` (análises nas abas de relatórios) | texto |
| `src/lib/whatsapp.functions.ts` | `gerarResumoGrupo` (relatório IA por período) | texto |
| `src/lib/whatsapp.functions.ts` | `transcreverAudios` (Whisper) | áudio → texto |
| `src/lib/whatsapp.functions.ts` | `analisarImagens` (visão/OCR) | imagem → texto |

Todos serão reescritos para chamar o roteador BYOK (`executarAiRouter` em `src/lib/ia.functions.ts`), que já suporta fallback entre provedores ativos por prioridade.

## Mudanças por etapa

### 1. Estender o roteador BYOK para áudio e imagem
Em `src/lib/ia.functions.ts`, adicionar duas funções ao lado das já existentes:

- `executarTranscricao({ admin, processo, arquivo, contentType, nome })` — percorre provedores OpenAI-compat ativos (OpenRouter, Groq, OpenAI) e chama `${base_url}/audio/transcriptions` com `multipart/form-data`. Provedores sem suporte (Anthropic, Gemini) são pulados. Registra em `ia_logs_uso` com `sucesso/erro` igual ao fluxo atual.
- `executarVisao({ admin, processo, prompt, imagemUrlOuBase64 })` — envia chat completion com bloco `image_url` para provedores OpenAI-compat; para Gemini, monta `contents` com `inlineData` (base64) via `generateContent`; Anthropic aceita `image` com base64 em `content`. Provedor sem visão é pulado.

Ambas seguem o mesmo padrão de "provedor preferido → fallback por prioridade" já usado em `executarAiRouter`.

### 2. Registrar processos novos em `ia_politicas`
Migração inserindo (se não existir) linhas para os processos:

- `resumo_whatsapp` — texto (`max_tokens: 2000`, `temperatura: 0.4`)
- `analise_relatorio` — texto (`max_tokens: 700`, `temperatura: 0.4`)
- `transcricao_audio` — áudio (sem `max_tokens`/`temperatura`)
- `analise_imagem` — visão (`max_tokens: 400`)

Isso torna cada processo configurável em **Configurações → IA → Política de Cadência** (provedor preferido, fallback etc.).

### 3. Reescrever os quatro pontos
- `gerarAnaliseAba` → `executarAiRouter({ processo: "analise_relatorio", mensagens: [{role:"user", content: prompt}] })`.
- `gerarResumoGrupo` → `executarAiRouter({ processo: "resumo_whatsapp", ... })`. Campo `autor_ia` da tabela `wa_resumos` passa a receber `${provedor}/${modelo}` retornado pelo roteador.
- `transcreverAudios` → `executarTranscricao({ processo: "transcricao_audio", ... })` para cada áudio, mantendo o loop e persistência em `wa_midias_analise` iguais.
- `analisarImagens` → `executarVisao({ processo: "analise_imagem", prompt, imagemUrl: signedUrl })`. Persistência em `wa_midias_analise` mantém a estrutura atual.

### 4. Remover dependência do Lovable Gateway
- Excluir os `import` de `@/lib/ai-gateway.server` e `process.env.LOVABLE_API_KEY` nesses arquivos.
- `src/lib/ai-gateway.server.ts` fica no projeto por enquanto (não estorva); pode ser removido depois se ninguém mais importar.
- Pacote `ai` continua instalado (não é mais usado nesses fluxos, mas removê-lo pode quebrar outros pontos — decisão em outra iteração).

### 5. UX de erro
Se todos os provedores falharem (ex.: nenhuma chave cadastrada, cota esgotada em todos), o roteador já lança `"Todos os provedores falharam. Primeiro erro: …"`. Os toasts em `whatsapp.$importacaoId.tsx` e nas telas de relatórios exibirão essa mensagem, orientando a ir em Configurações → IA.

## Detalhes técnicos

- Transcrição: assume que pelo menos um provedor OpenAI-compat com Whisper esteja ativo (OpenAI/OpenRouter/Groq). Se todos os provedores ativos forem só Gemini/Anthropic, retorna erro claro: "Nenhum provedor com suporte a transcrição ativo".
- Visão: mesmo tratamento; OpenAI/Anthropic/Gemini suportam nativamente, Groq (Llama Vision) via OpenAI-compat.
- Não há mudança de schema em `wa_*`. A migração toca só `ia_politicas`.
- Sem alterações de UI além dos textos de erro.

## Fora de escopo

- Não vamos remover `LOVABLE_API_KEY` dos secrets (útil como fallback futuro e ainda usado por conectores).
- Não vamos adicionar suporte a novos provedores (Ollama, self-hosted etc.) neste passo.
