## Diagnóstico

O CSV do Google Forms tem a coluna **"Idade"** (ex.: `53`, `57 anos`), mas o importador (`dadosGoogleForms` em `src/lib/inscricoes-digitais.functions.ts`) só guarda esse valor como texto dentro de `observacoes` ("Idade informada: 53."). Não grava `data_nascimento` nem um campo numérico de idade.

O dashboard (`src/lib/inscricoes-dashboard.ts` → `calcIdade`) calcula idade **exclusivamente** a partir de `data_nascimento`. Como o Forms não coleta data de nascimento, todas as inscrições importadas caem em "sem informação": idade média = 0, mediana = 0, faixa etária vazia, elegibilidade `>=16` falhando por "sem data de nascimento".

## Correção

Três frentes, sem mexer em schema (usa o `jsonb dados` que já existe):

1. **Importador Google Forms** — parsear a coluna "Idade" para número (tolerando sufixos como "anos") e gravar em `dados.idade` (novo campo numérico opcional). Continua também salvando o texto em `observacoes` para auditoria.

2. **Dashboard** — `calcIdade` passa a ser: se `data_nascimento` existir, usa como hoje; senão, faz fallback para `dados.idade` (número) e, como último recurso, extrai o número do texto "Idade informada: N" em `observacoes`. Assim os registros já importados voltam a contar mesmo antes do reprocesso.

3. **Reprocessar dados históricos** — nova server function `reprocessarIdadesInscricoes` (autenticada, coord/admin) que:
   - Busca todas as `inscricoes_digitais` do projeto atual sem `dados->>idade` numérico.
   - Extrai a idade de `dados.observacoes` (regex `Idade informada: (\d+)`) e grava em `dados.idade` via update jsonb (`jsonb_set`).
   - Retorna `{ atualizadas, semIdade }`.
   
   No dashboard, adicionar um botão **"Reprocessar idades"** que chama a função e invalida a query.

O schema Zod `dadosInscricaoDigitalSchema` recebe o campo opcional `idade: z.number().int().min(0).max(120).nullable().optional()` para que o update passe pelas validações existentes.

## Arquivos afetados

- `src/lib/inscricao-digital.ts` — adicionar campo `idade` opcional no schema e no default.
- `src/lib/inscricoes-digitais.functions.ts` — parse de idade em `dadosGoogleForms`; nova server fn `reprocessarIdadesInscricoes`.
- `src/lib/inscricoes-dashboard.ts` — `calcIdade` com fallback para `dados.idade` e observações.
- `src/routes/_authenticated/administrativo.inscricoes-dashboard.tsx` — botão "Reprocessar idades" + toast + invalidação.

## Fora de escopo

Não altera storage, RLS, nem toca em `data_nascimento` das beneficiárias já criadas — só na fila `inscricoes_digitais`.