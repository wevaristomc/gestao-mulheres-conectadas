## Diagnóstico

Em `src/lib/relatorios-queries.ts` (linhas 218–224) o detector de tabela de frequência do relatório ainda tenta `frequencias` **antes** de `presencas`:

```ts
for (const t of ["frequencias", "presencas"] as const) { ... }
```

No banco real (yqvocpnvunaprpmhlswn) existe uma `frequencias` legada (tabela ou view desatualizada) que o app **não** grava — a aba **Fiscalização MTE** escreve em `presencas` via `upsertPresencaMTE`. Como o detector vê `frequencias` primeiro e não dá erro, o relatório lê dali e nunca enxerga o que foi lançado em `presencas`.

O `pedagogico-queries.ts` já foi corrigido antes com a ordem `["presencas", "frequencias"]` justamente por esse motivo; o relatório ficou de fora.

## Correção

Ajuste único em `src/lib/relatorios-queries.ts`:

- Trocar a ordem no `detectarTabelaFrequencia` para `["presencas", "frequencias"]`, alinhando com `pedagogico-queries.ts`.
- Como o loop já pega a primeira que responder sem erro, `presencas` (fonte de verdade) passa a ser sempre a escolhida quando existir.

Isso faz o relatório BET-MC-02 refletir imediatamente qualquer presença lançada na Fiscalização MTE (a invalidação de cache do turno anterior já está no lugar).

## Fora de escopo

- Não vou mexer no esquema do banco nem nas RLS.
- Não vou remover a `frequencias` legada — apenas parar de lê-la.
