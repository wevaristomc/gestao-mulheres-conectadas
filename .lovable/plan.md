## Problema

O import falha com `Could not find the table 'public.ava_importacoes' in the schema cache` porque as tabelas espelho do AVA (`ava_importacoes`, `ava_users`, `ava_courses`, `ava_enrolments`, `ava_activities`, `ava_completions`, `ava_grades`) ainda não existem no banco de dados real do projeto (`yqvocpnvunaprpmhlswn`).

O SQL de criação já está pronto e versionado em `docs/migrations/importar-turmas-e-ava.sql` (idempotente, com `GRANT`, RLS e políticas). Ele nunca foi executado.

## Restrição

As ferramentas de migration do Lovable Cloud apontam para o projeto gerenciado padrão (`ahgcdtnpdfkcrjkxclhb`), e não para o projeto real usado pelo app (`yqvocpnvunaprpmhlswn`, hardcoded em `client.server.ts` e `auth-middleware.ts`). Portanto a migração **não pode** ser aplicada via tool automatizada — precisa ser executada manualmente no SQL Editor do projeto correto.

## Ação

1. Abrir o SQL Editor do projeto `yqvocpnvunaprpmhlswn` no painel do Supabase.
2. Copiar o conteúdo integral de `docs/migrations/importar-turmas-e-ava.sql` e executar. O script é idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), então rodar duas vezes não causa dano.
3. Confirmar que também existe o bucket `evidencias` no Storage (o import faz `upload` em `evidencias/moodle-dumps/…`). Criar caso não exista, marcando como privado.
4. Voltar ao app e reenviar o dump — o erro de schema deve desaparecer.

Nenhuma alteração de código é necessária nesta rodada: a lógica do server function e do cartão de UI já espera exatamente esse schema.

## Arquivos envolvidos

- `docs/migrations/importar-turmas-e-ava.sql` — SQL a ser executado manualmente (sem edição).
