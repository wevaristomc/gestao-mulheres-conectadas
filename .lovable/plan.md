# Corrigir rótulos: turmas mostram UUID, documentos mostram caminho de storage

## Diagnóstico

**Turmas (Pedagógico / Administrativo / Relatórios).** Nas telas, o nome da turma é lido por uma função `pickFirst(row, ["nome", "titulo", "descricao"]) ?? row.id`. As turmas importadas pelo "Consolidado QAJBC" gravam `codigo_turma` (ex.: `JBT-MC-01`) e `nome_curso` (ex.: `Mulheres Conectadas`), mas **não** `nome`/`titulo`/`descricao`. Por isso o fallback cai no `row.id` e o UUID aparece na coluna Turma, no cabeçalho da turma e nos relatórios.

**Base de Conhecimento.** A lista renderiza `pickFirst(r, ["titulo", "nome", "nome_arquivo", "storage_path"])`. Quando o registro não tem título/nome/nome_arquivo (documentos antigos ou importados em lote), cai em `storage_path`, que segue o formato `<projeto_id>/<uuid>-<nome_original>`. Isso produz o texto longo `d91d2e5a…/aa31fb33…-Documento.pdf`.

## Correções (só apresentação, sem migração)

1. **Rótulo unificado de turma.** Estender a lista de fallback para incluir `codigo_turma` e `nome_curso` antes de recorrer ao id, e nunca exibir o UUID cru — trocar por `"Turma sem nome"`. Locais:
   - `src/lib/pedagogico-queries.ts` — ordenação da listagem (linhas 21-22).
   - `src/routes/_authenticated/pedagogico.index.tsx` — coluna Turma da tabela.
   - `src/routes/_authenticated/pedagogico.turmas.$id.tsx` — cabeçalho do detalhe.
   - `src/routes/_authenticated/administrativo.qualificacao.tsx` — selector de turma e título da aba.
   - `src/lib/relatorios-queries.ts` — `turmaNome` em Frequência (linha 304) e Pedagógico (linha 386).

   Ordem final do fallback: `nome → titulo → descricao → codigo_turma → nome_curso → "Turma sem nome"`.

2. **Rótulo do documento na Base de Conhecimento.** Em `src/routes/_authenticated/base-conhecimento.tsx`, criar um helper local `labelDocumento(row)`:
   - Se houver `titulo`/`nome`/`nome_arquivo`, usa esse valor.
   - Senão, pega `storage_path`, mantém só o trecho depois da última `/` (remove o `projeto_id`) e retira o prefixo `uuid-` (regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-`), devolvendo apenas o nome original do arquivo.
   - Fallback final: `"Documento sem título"`.
   Usar `labelDocumento` na célula principal e na filtragem de busca (linhas 122 e 298); o subtítulo (`nome_arquivo` abaixo) continua igual quando houver título distinto.

## Fora do escopo

- Nenhuma mudança de schema, migração ou reimportação. Turmas antigas não recebem `nome`; a UI passa a mostrar o `codigo_turma` que já existe.
- Documentos antigos continuam sem `titulo` no banco; a UI apenas apresenta um rótulo limpo. Um backfill opcional pode ser feito depois se o usuário quiser gravar títulos definitivos.

## Verificação

Após implementar, abrir Pedagógico, Administrativo → Qualificação e Relatórios → Pedagógico/Frequência: as turmas devem aparecer como `JBT-MC-01`, `BET-MC-02`, etc. Em Base de Conhecimento, os documentos devem mostrar só o nome do arquivo (sem o `projeto_id/uuid-` na frente).
