# Corrigir salvar Configurações › Executora e erro em Instrutores ↔ Turmas

## Diagnóstico

O app usa um Supabase externo (`yqvocpnvunaprpmhlswn`, hardcoded em `src/integrations/supabase/client.ts`), distinto do Lovable Cloud gerenciado. Não tenho acesso direto de leitura/escrita àquele banco pelo sandbox — só o app em runtime enxerga a estrutura real. Isso muda o plano: precisamos deixar o **código tolerante ao schema** e entregar um **SQL de migração** para o usuário aplicar no Supabase externo.

### 1. Configurações › Executora não salva

`src/routes/_authenticated/configuracoes.index.tsx` monta o payload com `executora_nome`, `cnpj`, `endereco`, `valor_global`, `custo_aluno_hora`, `vigencia_inicio`, `vigencia_fim`, `nome` e, em erros de "column does not exist", **remove a coluna e tenta de novo até 6 vezes**. Consequência: se as colunas de executora não existem em `projetos`, o payload esvazia, o update roda vazio, `onSuccess` dispara e o usuário vê "atualizado" — mas nada foi salvo. Se a coluna `nome` for a única remanescente, o comportamento parece "salvou o nome, mas nada da executora".

### 2. `column instrutor_turmas.projeto_id does not exist`

`src/lib/rbac.functions.ts` (`listarInstrutorTurmas` e `vincularInstrutorTurma`) filtra/insere `projeto_id` diretamente em `instrutor_turmas`. A tabela existe no banco externo, mas sem esse coluna. Precisa ser criado no banco e o código deve tolerar a ausência (derivando via `turmas.projeto_id`).

## Alterações

### A. `src/routes/_authenticated/configuracoes.index.tsx`
- Mesma mecânica de "drop coluna e re-tenta", mas: (i) se ao final o payload ficou sem nenhuma das colunas de executora que o usuário mexeu, exibir toast de aviso listando as colunas ausentes ("executora_nome, cnpj, endereco não existem na tabela `projetos` — rode a migração pendente") em vez de "atualizado com sucesso"; (ii) se o payload esvaziar totalmente, tratar como erro.

### B. `src/lib/rbac.functions.ts`
- `listarInstrutorTurmas`: preferir filtro via join a `turmas` (`.eq("turmas.projeto_id", projetoId)` com select `*, turmas!inner(projeto_id)`). Se falhar por coluna ausente em `turmas`, cair para `select("*")` sem filtro por projeto e filtrar no cliente pelas turmas do projeto (já disponíveis via `listarTurmasDoProjeto`).
- `vincularInstrutorTurma`: primeiro tentar upsert com `projeto_id`. Se erro "column instrutor_turmas.projeto_id does not exist", retentar sem o campo. Idem `desvincularInstrutorTurma` (não usa `projeto_id`, mas revisar).

### C. Migração para o Supabase externo

Como não temos acesso ao banco externo por aqui, entregar `docs/migrations/fix-schema-executora-e-instrutor-turmas.sql` com:

```sql
-- 1) Colunas de executora e parâmetros no projeto (idempotente)
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS executora_nome   text,
  ADD COLUMN IF NOT EXISTS cnpj             text,
  ADD COLUMN IF NOT EXISTS endereco         text,
  ADD COLUMN IF NOT EXISTS vigencia_inicio  date,
  ADD COLUMN IF NOT EXISTS vigencia_fim     date,
  ADD COLUMN IF NOT EXISTS valor_global     numeric,
  ADD COLUMN IF NOT EXISTS custo_aluno_hora numeric;

-- 2) projeto_id em instrutor_turmas, preenchido via turma
ALTER TABLE public.instrutor_turmas
  ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id);

UPDATE public.instrutor_turmas it
   SET projeto_id = t.projeto_id
  FROM public.turmas t
 WHERE t.id = it.turma_id
   AND it.projeto_id IS NULL;

CREATE INDEX IF NOT EXISTS instrutor_turmas_projeto_id_idx
  ON public.instrutor_turmas(projeto_id);
```

O usuário roda esse SQL no console SQL do banco externo. O código continua funcionando antes e depois da migração graças ao fallback.

## Arquivos alterados

- `src/routes/_authenticated/configuracoes.index.tsx`
- `src/lib/rbac.functions.ts`
- `docs/migrations/fix-schema-executora-e-instrutor-turmas.sql` (novo)

## Verificação

- Typecheck limpo.
- Antes da migração: abrir Configurações › Instrutores ↔ Turmas → lista carrega (fallback), vincular funciona sem `projeto_id`; salvar Executora exibe toast de aviso apontando as colunas ausentes.
- Depois da migração: comportamento normal, valores persistem, tabela `instrutor_turmas` volta a ter `projeto_id` populado.
