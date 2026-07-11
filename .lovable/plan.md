## Problema

Na tela **Relatórios MTE**, o `ComprovacaoTurmaCard` faz:

```
supabase.from("evidencias").select("id, turma_id, aula_id, tipo, descricao, arquivo_nome, created_at")
```

O Postgres responde `column evidencias.arquivo_nome does not exist` — a coluna nunca foi criada na tabela real, embora o código (várias telas de comprovação/aula) já dependa dela.

Outros pontos que leem/gravam `evidencias.arquivo_nome`:
- `src/components/pedagogico/aula-comprovacao-dialog.tsx` (list, download, delete)
- `src/routes/_authenticated/mte.evidencias.tsx` (insert e list)
- `src/lib/pedagogico-queries.ts`, `src/lib/leitor-lista.ts`, `src/lib/mte-queries.ts` (insert com nome padronizado)

Ou seja, o fix é puramente de schema: adicionar a coluna que o app já espera.

## Correção

Nova migração idempotente **`docs/migrations/evidencias-arquivo-nome.sql`** (você aplica no banco real):

```sql
ALTER TABLE public.evidencias
  ADD COLUMN IF NOT EXISTS arquivo_nome text;
```

Sem mudanças de RLS, sem GRANT novo (tabela já existente), sem alteração em nenhum arquivo de código — o app volta a funcionar assim que a migração rodar.

## Fora de escopo

- Não altero `types.ts` (é auto-gerado; regenera após a migração).
- Não mexo em outras telas nem no fluxo de Drive/base de conhecimento.
- Não adiciono validação/NOT NULL — mantido `nullable` para não quebrar registros já gravados.