## Problema

O erro "Could not find the table 'public.frequencias'" surge porque a tabela `frequencias` (e várias outras do módulo Pedagógico/MTE) não existem no banco.

Verifiquei `pg_tables` no schema `public` e só existem hoje:
`importacoes_presenca, instrutor_turmas, notificacoes, orbe_conversas, orbe_mensagens, permissoes_papel, projetos, turmas, user_roles`.

Ao inspecionar `docs/migrations/*.sql`, nenhum arquivo cria as tabelas base do módulo (`aulas`, `matriculas`, `cursistas`, `beneficiarias`, `presencas`, `frequencias`, `evidencias_aula`, etc.). Os SQLs de lá são **extensões** (ex.: `consolidado-pedagogico.sql` adiciona colunas em `matriculas`; `evidencias-aula.sql`, `etapas.sql`, `rbac-e-relacao-horas.sql`, `importar-turmas-e-ava.sql` etc. dependem de tabelas já existentes). Simplesmente reaplicar `docs/migrations/` **não** vai resolver — nem sequer roda, porque essas tabelas base não estão presentes.

## Plano

Criar uma migração consolidada que reconstrói o esquema Pedagógico/MTE ausente e, na sequência, aplica as extensões de `docs/migrations/` que ainda não estão no banco.

### 1. Migração `base-pedagogico-mte` (criar tabelas base)

Tabelas inferidas do código (`src/lib/mte-queries.ts`, `pedagogico-queries.ts`, `relatorios-queries.ts`, `orbe.functions.ts`, `leitor-lista.ts`, `consolidado-qajbc.functions.ts`, `certificados.functions.ts`):

- `public.beneficiarias` — cadastro de participantes (nome, cpf, data_nascimento, genero, raca, pcd, tipo_deficiencia, telefone, email, endereco, municipio, nis, campos de programa social e bancários).
- `public.cursistas` — variante usada no fluxo Pedagógico (nome, cpf, email, telefone, municipio). Chave única parcial em CPF já prevista em `consolidado-pedagogico.sql`.
- `public.aulas` — vinculada a `turmas(id)`: data, titulo, tema/assunto, conteudo/conteudo_programatico, duracao/ch/ch_prevista, hora_inicio, hora_fim, instrutor, ordem.
- `public.matriculas` — vinculada a `turmas(id)` + `beneficiaria_id` (FK beneficiarias) + `cursista_id` (FK cursistas, nullable): status, data_inscricao, data_conclusao, motivo_evasao, ficha_inscricao_url, frequencia_percentual, assinou_lista, observacao_importacao, certificado_url, certificado_emitido_em.
- `public.presencas` — `(aula_id, matricula_id)` único, `presente boolean`, `justificativa text`. É a tabela que a UI de MTE usa e é o alvo do fallback do Pedagógico.
- `public.evidencias_aula` — anexos por aula (usada pelo dialog de comprovação e por `evidenciasCountByTurmaOptions`).

Para cada tabela nova, seguir o padrão exigido:
1. `CREATE TABLE public.<t>(...)` com `id uuid default gen_random_uuid()`, `created_at`, `updated_at`, defaults sensatos e `NOT NULL` só onde o código sempre grava.
2. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` (sem `anon`).
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
4. Políticas RLS escopadas por projeto/turma, reaproveitando `has_role_any` e `instrutor_turmas`:
   - Leitura: membros do projeto da turma vinculada; professor/auxiliar só lê linhas de turmas em `instrutor_turmas`.
   - Escrita: coordenação/administrativo + professor/auxiliar restrito às turmas vinculadas.
5. Trigger `update_updated_at_column` onde há `updated_at`.

Frequência: manter `presencas` como fonte canônica (é o que `mte-queries.ts` e `leitor-lista.ts` gravam). Também criar uma **view** `public.frequencias` = `SELECT id, aula_id, matricula_id, presente FROM public.presencas` com `GRANT SELECT` para `authenticated`, para que `frequenciaByTurmaOptions` (Pedagógico) enxergue a mesma leitura sem duplicar tabelas. `upsertFrequencia` grava em `presencas` — verificar/ajustar `src/lib/pedagogico-queries.ts` só se o upsert atual escreve em `frequencias`; se for o caso, redirecionar para `presencas`. Sem outras mudanças de negócio.

### 2. Reaplicar extensões de `docs/migrations/` na ordem

Todas idempotentes; rodar após a criação das tabelas base:

```text
1) consolidado-qajbc.sql
2) consolidado-pedagogico.sql
3) importar-turmas-e-ava.sql
4) evidencias-aula.sql
5) leitor-lista-presenca.sql   (importacoes_presenca já existe — no-op p/ tabela, mas mantém colunas/policies em dia)
6) rbac-e-relacao-horas.sql    (cria relacoes_horas, relacoes_horas_itens, locais)
7) etapas.sql
8) fix-schema-executora-e-instrutor-turmas.sql
9) drive-sync.sql
10) relatorio-parcial-objeto.sql
11) ia-politica-parcial-objeto.sql
12) base-conhecimento-plus.sql
13) whatsapp-para-base-conhecimento.sql
14) orbe-neural.sql             (tabelas orbe_* já existem — reaplicar policies)
15) security-fixes-rls-storage.sql
```

Se algum arquivo referenciar objetos que continuam ausentes (ex.: `documentos` bucket já existe), o `IF NOT EXISTS`/`DO $$` guardas absorvem sem erro.

### 3. Depois da migração

- Rodar `supabase--linter` e corrigir avisos relacionados às tabelas novas.
- Ajustes de código, apenas se necessário:
  - `pedagogico-queries.ts`: se `upsertFrequencia` insere em `frequencias`, trocar para `presencas` (view não aceita upsert).
  - Remover o cache/detecção `detectarTabelaFrequencia` — passa a existir `presencas` sempre; sem fallback.
- Verificar a aba Frequência (`/pedagogico/turmas/:id/frequencia`) e a chamada MTE (`/mte/presencas`) no preview.

### Riscos e observações

- **Colunas inferidas do código**: podem faltar campos que uma UI específica exige. Se surgir “coluna X não existe” após aplicar, adiciono com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` numa migração pequena.
- **Sem dados**: as tabelas são criadas vazias. Importações (CSV/AVA/Moodle) do próprio app populam o restante.
- **Migrações antigas em `docs/migrations/`**: continuam como referência; o passo 2 acima é uma nova migração única que aplica o conteúdo delas, respeitando `IF NOT EXISTS`.

## Arquivos a criar

- `supabase/migrations/<ts>_pedagogico-mte-base.sql` — passo 1.
- `supabase/migrations/<ts+1>_pedagogico-mte-extensoes.sql` — passo 2 (conteúdo consolidado de `docs/migrations/`).

Nenhum arquivo de app precisa ser reescrito neste passo, exceto o eventual ajuste de `upsertFrequencia` mencionado.
