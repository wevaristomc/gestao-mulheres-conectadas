## Problema

Ao salvar aula em `/pedagogico/turmas/:id/aulas`, o backend retorna 400:

```
PGRST204 — Could not find the 'ch_prevista' column of 'aulas' in the schema cache
```

A tabela `aulas` (schema legado do pedagógico) tem apenas: `id, turma_id, data, conteudo, ch_dia, modulo, data_aula, instrutor, lista_presenca_url, numero_aula, titulo, duracao, ordem`.

O formulário e `upsertAula` enviam campos que não existem nessa tabela: `conteudo_programatico`, `ch_prevista`, `hora_inicio`, `hora_fim` — daí qualquer edição/criação falha silenciosamente (toast de erro).

Esses mesmos campos são usados pelo cabeçalho institucional das listas de presença e pelos fallbacks já implementados, então a solução correta é **adicionar as colunas ausentes**, não remover do formulário.

## Solução

### 1. Migração — adicionar 4 colunas em `public.aulas`

```sql
ALTER TABLE public.aulas
  ADD COLUMN IF NOT EXISTS conteudo_programatico text,
  ADD COLUMN IF NOT EXISTS ch_prevista numeric,
  ADD COLUMN IF NOT EXISTS hora_inicio text,
  ADD COLUMN IF NOT EXISTS hora_fim text;
```

Backfill leve para aulas antigas (opcional mas ajuda a UI já mostrar o tema real):

```sql
UPDATE public.aulas
   SET conteudo_programatico = COALESCE(conteudo_programatico, conteudo, titulo)
 WHERE conteudo_programatico IS NULL;

UPDATE public.aulas
   SET ch_prevista = duracao
 WHERE ch_prevista IS NULL AND duracao IS NOT NULL;
```

Sem mudança de RLS/policies/grants (a tabela já tem).

### 2. `src/lib/pedagogico-queries.ts` — `upsertAula`

Espelhar campos para manter o schema legado consistente:
- Quando `conteudo_programatico` é enviado, gravar também em `conteudo` (colunas antigas continuam populadas para relatórios que ainda leem `conteudo`/`titulo`).
- Quando `ch_prevista` é enviado, gravar também em `duracao`.

Nenhuma outra alteração é necessária — o formulário e o restante do código já usam esses nomes.

## Verificação

- Abrir uma aula existente ("Aula 01 — JBT-MC-01"), editar tema/instrutor/horas/CH, salvar → toast "Aula atualizada" e linha atualizada na tabela.
- Criar nova aula → aparece na listagem.
- Gerar lista de presença dessa aula → cabeçalho mostra instrutor, horário e CH corretos.
