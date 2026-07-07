## Objetivo

Dois novos importadores na rota **MTE › Importar Lista**, mantendo o leitor OCR de lista de presença atual:

1. **CSV bancário por turma** — cria turma mínima + beneficiárias (com banco/agência/conta) + matrículas.
2. **Dump SQL do Moodle/AVA** — cria tabelas espelho (alunos, cursos, matrículas AVA, atividades, conclusões, notas) e cruza com beneficiárias/turmas.

Tudo editável nas telas existentes depois.

---

## Parte 1 — Importador CSV (turmas + alunas)

### Banco (migration única)

- `beneficiarias`: adicionar `banco text`, `agencia text`, `conta text`.
- `matriculas`: adicionar `assinou_lista boolean default false`, `observacao_importacao text` e índice único `(turma_id, beneficiaria_id)` para upsert idempotente.

### Parser (`src/lib/importador-turma-csv.ts`, novo)

- Aceita `,` ou `;` (usa o parser CSV já em `beneficiarias-csv-import.tsx`).
- Extrai da 1ª linha ou do **nome do arquivo** (fallback) o `codigo_turma` (regex `[A-Z]+-[A-Z]+-\d+`) e o turno (Manhã/Tarde/Noite).
- Município derivado do prefixo do código: `JBT`→Juatuba, `BET`→Betim, outros→Belo Horizonte (editável depois).
- Localiza linha de cabeçalho por `Nome` + `CPF`. Extrai por linha: nome, CPF (`onlyDigits` + `isValidCpf`), banco, agência, conta, e detecta em qualquer coluna extra `assinou` vs `não/nao assinou`. Linhas "não tem dados" ficam válidas sem dados bancários.

### UI (dentro de `mte.importar-lista.tsx`)

Card superior "**Importar turma + alunas (CSV bancário)**", separado do OCR. Input `multiple` (vários CSVs de uma vez), preview por arquivo (turma detectada, alunas válidas, erros) e botão Importar que roda em sequência por arquivo:

1. `upsertTurmaMTE` (busca prévia por `codigo_turma` para reaproveitar id).
2. `importBeneficiariasBulk` (upsert por CPF, agora com banco/agência/conta).
3. `upsertMatriculasBulk` novo (upsert por `(turma_id, beneficiaria_id)` com `assinou_lista`, `observacao_importacao`).

Toast final com totais. Sem edge function, tudo no cliente autenticado.

### Edição posterior

- `BeneficiariaFormDialog` ganha campos banco/agência/conta.
- `MatriculaFormDialog` ganha checkbox "assinou lista" e campo observação.
- Turmas criadas ficam listadas em MTE › Turmas com o alerta de `faltantesTurma` já existente (usuário completa data/CH/etc.).

---

## Parte 2 — Importador do dump Moodle/AVA (upload .sql)

### Novas tabelas espelho no Lovable Cloud (migration)

Nomeadas com prefixo `ava_` e RLS aberta a `authenticated` (dados operacionais do projeto, não pessoais externos):

- `ava_users`: `moodle_id bigint pk`, `username`, `idnumber`, `email`, `firstname`, `lastname`, `cpf` (derivado de `idnumber`/`username` quando são 11 dígitos), `lastaccess timestamptz`, `beneficiaria_id uuid` (FK opcional).
- `ava_courses`: `moodle_id bigint pk`, `shortname`, `fullname`, `category`, `startdate`, `enddate`, `turma_id uuid` (FK opcional).
- `ava_enrolments`: `id uuid pk`, `ava_user_id`, `ava_course_id`, `status`, `timestart`, `timeend`, `timecreated`.
- `ava_activities`: `moodle_cmid bigint pk`, `ava_course_id`, `modulename` (assign/quiz/forum/…​), `instance_id`, `nome`, `completion_enabled bool`.
- `ava_completions`: `id uuid pk`, `ava_user_id`, `ava_activity_id`, `completionstate int`, `timemodified`.
- `ava_grades`: `id uuid pk`, `ava_user_id`, `grade_item_id bigint`, `ava_course_id`, `itemname`, `itemtype` (course/mod), `finalgrade numeric`, `rawgrademax numeric`, `timemodified`.
- `ava_importacoes`: metadados de cada upload (arquivo, tamanho, linhas processadas, iniciado/terminado, resumo por tabela).

Todas com GRANT `authenticated`/`service_role`, RLS habilitada, políticas `TO authenticated` para SELECT/INSERT/UPDATE/DELETE.

### Server function `importarDumpMoodle` (`src/lib/moodle-import.functions.ts`, novo)

- `createServerFn({ method: "POST" })` com `requireSupabaseAuth` + verificação de role `admin` via `has_role` (privilegiada; usa `supabaseAdmin` importado dentro do `.handler()`).
- Recebe `{ storage_path }` — o arquivo `.sql` sobe primeiro para o bucket `evidencias/moodle-dumps/…` pelo cliente (chunked resumable upload já suportado pelo Supabase JS), server function faz download em stream.
- Parser SQL simples e específico:
  - Filtra só os `INSERT INTO` das tabelas de interesse: `pmc_user`, `pmc_course`, `pmc_user_enrolments`, `pmc_enrol`, `pmc_course_modules`, `pmc_modules`, `pmc_course_modules_completion`, `pmc_grade_items`, `pmc_grade_grades`.
  - Ignora completamente `pmc_logstore_standard_log`, backups e histórico (dominam o dump).
  - Percorre linha-a-linha, junta linhas até o `;` final do INSERT, faz split de tuplas cuidadoso (aspas + escapes MariaDB `\'`, `\"`, `\\`).
  - Grava em chunks de 500 rows por tabela via `supabaseAdmin.from(...).upsert(...)`.
- Cruzamentos automáticos na mesma execução:
  - **Aluno ↔ Beneficiária**: match por CPF (`ava_users.cpf = beneficiarias.cpf`); grava `beneficiaria_id`. Sem CPF válido → fica nulo (marcado pendente na UI).
  - **Curso ↔ Turma**: match por `upper(ava_courses.shortname) = upper(turmas.codigo_turma)` ou `contains`. Casos ambíguos → `turma_id` nulo (pendente).
- Retorna `{ importacao_id, resumo: { users, courses, ..., matched_users, matched_courses } }`. Erros por tabela não interrompem as outras.

### UI (dentro de `mte.importar-lista.tsx`)

Card "**Importar dump do AVA/Moodle (.sql)**":

1. Input de arquivo `.sql`; faz upload para storage em chunks e exibe barra de progresso.
2. Ao concluir upload, chama `importarDumpMoodle`. Enquanto roda, faz polling em `ava_importacoes` para mostrar contagem parcial.
3. Painel de resultado com totais e dois botões:
   - **Revisar vínculos pendentes** → modal com alunos sem beneficiária e cursos sem turma, com dropdowns manuais para casar.
   - **Ver dashboard AVA** (Parte 3).

### Parte 3 — Cruzamento (uso dos dados)

Nova aba/rota `MTE › AVA` (`mte.ava.tsx`) — só leitura no primeiro momento:

- Lista de cursos AVA com turma vinculada, número de alunos, % de conclusão, nota média.
- Ao clicar num curso: tabela de alunos com colunas nome, CPF, matriculada no MTE (sim/não), % atividades concluídas, nota final. Botão para vincular manualmente aluno↔beneficiária quando o CPF do Moodle estava faltando/inválido.
- Filtros por turma, município e status de matrícula.

Sem cálculo de frequência automática do MTE a partir do AVA nesta etapa — só disponibiliza os dados cruzados para consulta.

---

## Detalhes técnicos

- Dump esperado até ~1 GB. Server function no Cloudflare Worker lê o arquivo do storage em stream e processa em janelas de texto (~4 MB), não carrega tudo em memória.
- Upload do `.sql` usa `supabase.storage.from("evidencias").uploadToSignedUrl` (resumable, aceita arquivos grandes). Requer criar/verificar o bucket `evidencias` (já usado pelo projeto).
- Parser MariaDB: aceita `\'`, `\"`, `\\`, `\n`, `\r`, `\0` como escapes; valores `NULL` mapeados para `null`; datas Unix (bigint segundos) convertidas para `timestamptz`.
- Índices: `ava_users(cpf)`, `ava_users(beneficiaria_id)`, `ava_courses(shortname)`, `ava_courses(turma_id)`, `ava_completions(ava_user_id, ava_activity_id) unique`, `ava_grades(ava_user_id, grade_item_id) unique`.
- CPF do Moodle: extrai de `idnumber` se tiver 11 dígitos após `onlyDigits`; senão tenta `username`.
- `has_role('admin')` obrigatório na server function; usuários comuns não veem o botão de upload.

## Fora de escopo

- Importar `pmc_logstore_standard_log`, `pmc_grade_grades_history`, presets, badges, forum posts, arquivos anexados.
- Sincronização automática recorrente (fica só a importação manual on-demand).
- Cálculo/pagamento de benefícios a partir dos dados bancários.
- Alterações no leitor OCR de lista de presença já existente.
