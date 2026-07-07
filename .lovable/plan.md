## Problema

Ao clicar em "Testar" em qualquer provedor de IA, o spinner aparece e some, mas nenhum toast (sucesso ou erro) é exibido. Os logs mostram que o servidor está respondendo corretamente (Groq: OK; Gemini: 429; OpenRouter: 401) — o problema é o toast do sonner não aparecendo nesta tela.

## Solução

Adicionar feedback **inline persistente** dentro de cada `ProvedorCard`, logo abaixo dos botões, mostrando o resultado do último teste/save. Assim o usuário sempre vê o que aconteceu, independente do toast.

## Mudanças (1 arquivo)

**`src/routes/_authenticated/configuracoes.ia.tsx`** — função `ProvedorCard`:

1. Renderizar uma linha de status abaixo da fila de botões usando o estado das mutations (`testarMut.data`, `testarMut.error`, `salvarMut.error`, `salvarMut.isSuccess`).

2. Estilo:
   - **Sucesso do teste**: caixa verde suave com `CheckCircle2` + `"OK — {modelo} · {tokens} tokens"` + trecho da resposta (`resposta.slice(0, 120)`).
   - **Erro (teste ou save)**: caixa vermelha suave com `AlertCircle` + mensagem completa (até 300 chars, com `whitespace-pre-wrap` e `break-words` para caber mensagens longas tipo o 429 do Gemini).
   - **Sucesso do save**: caixa verde discreta com "Salvo".

3. A caixa some quando `isPending` volta a `true` (nova tentativa) ou permanece até nova ação.

4. Manter os `toast.*` existentes (redundância barata).

## Fora de escopo

- Nada de mudança em server functions, schema ou lógica de roteamento de IA.
- Nada de mudança nos outros cards/seções (Políticas, Consumo).
- Não investigar por que o Toaster do sonner não aparece nesta rota — o feedback inline resolve o sintoma reportado pelo usuário e é mais robusto de qualquer forma.
