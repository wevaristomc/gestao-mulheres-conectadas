## Corrigir erro `column turmas.nome does not exist`

### Causa

Duas queries fazem `.order("nome", ...)` na tabela `turmas`, mas a coluna `nome` não existe nesse schema. O Postgres rejeita o pedido antes de devolver qualquer linha, então a tela `/pedagogico` mostra o erro e a de qualificação também depende disso.

Arquivos afetados:
- `src/lib/pedagogico-queries.ts` → `turmasListOptions` (`.order("nome")`)
- `src/lib/administrativo-queries.ts` → `turmasDoProjetoOptions` (`.select("id, nome, titulo").order("nome")`)

### Correção

Como o resto do módulo já foi escrito para descobrir o nome da turma em runtime via `pickFirst(row, ["nome", "titulo", "descricao"])`, a correção é remover a dependência da coluna `nome` no servidor e ordenar no cliente:

1. **`src/lib/pedagogico-queries.ts` → `turmasListOptions`**
   - Trocar `.order("nome", { ascending: true })` por nada; manter `.select("*")`.
   - Após receber `data`, ordenar client-side por `pickFirst(row, ["nome","titulo","descricao"]) ?? ""` com `localeCompare` pt-BR.

2. **`src/lib/administrativo-queries.ts` → `turmasDoProjetoOptions`**
   - Trocar `.select("id, nome, titulo")` por `.select("*")` (o resto do código já usa `pickFirst`/`Row`, então nada quebra).
   - Remover `.order("nome", { ascending: true })` e ordenar client-side com o mesmo critério acima.
   - Se preferir manter o `select` enxuto: usar `.select("id, titulo, descricao, turno, data_inicio, data_fim")` — mas `*` é mais seguro porque também esconde qualquer outra coluna faltante e mantém o padrão "descubra em runtime" já adotado no plano do módulo.

Nenhuma outra query precisa mudar: `turmaByIdOptions`, `aulasByTurmaOptions`, `cursistasByTurmaOptions` e `frequenciaByTurmaOptions` não referenciam `nome`.

### Fora do escopo

- Não vou renomear colunas no banco nem criar migração — o schema real é a fonte da verdade e o módulo já foi construído para se adaptar a ele.
- Não vou mexer nos componentes das telas; eles já usam `pickFirst` para exibir o nome.
