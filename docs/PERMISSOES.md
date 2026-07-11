# Matriz de permissões — Painel Mulheres Conectadas

Este documento consolida o RBAC aplicado nas 3 camadas do painel após a
auditoria de vazamento de permissões. A fonte da verdade em runtime é o
banco (RLS + policies); esta tabela documenta o que o app deve mostrar/
esconder e o que cada server function verifica.

## 1. Matriz papel × módulo

`✓` = acesso · `—` = sem acesso · `(escopo)` = restrito ao próprio dado / às
turmas vinculadas via `instrutor_turmas`.

| Módulo               | coord. geral | administrativo | coord. pedagógico | gestor financeiro | professor / auxiliar |
|----------------------|:---:|:---:|:---:|:---:|:---:|
| Visão Geral (`/`)    | ✓ | ✓ | ✓ | ✓ | — (redirect `/pedagogico`) |
| Etapas do Projeto    | ✓ | ✓ | ✓ | ✓ | ✓ (leitura) |
| Pendências           | ✓ | ✓ | ✓ | ✓ | — |
| Pedagógico           | ✓ | ✓ | ✓ | — | ✓ *(escopo: só suas turmas)* |
| Fiscalização MTE     | ✓ | ✓ | ✓ | — | — |
| Administrativo       | ✓ | ✓ | — | — | — |
| Financeiro           | ✓ | ✓ | — | ✓ | — |
| Captação             | ✓ | ✓ | — | ✓ | — |
| Relatórios           | ✓ | ✓ | ✓ | ✓ | — |
| WhatsApp             | ✓ | ✓ | ✓ | — | — |
| Relação de Horas     | ✓ | ✓ | — | — | ✓ *(própria)* |
| Financ. Relações-Horas | ✓ | ✓ | — | ✓ | — |
| Base de Conhecimento | ✓ | ✓ | ✓ | ✓ | ✓ *(leitura + busca)* |
| Drive do Projeto     | ✓ | ✓ | ✓ | — | — |
| Configurações        | ✓ | ✓ | — | — | — |
| Ajuda                | ✓ | ✓ | ✓ | ✓ | ✓ |

A matriz de UI vive em `src/lib/role-access.ts` (`MODULE_ACCESS`) e é
aplicada pela guarda `requireModuleAccess` (arquivo `src/lib/auth-guard.ts`).
Rotas fora do escopo do papel redirecionam para o "landing" padrão do
usuário (`landingPathForRole`): coordenação → `/`, financeiro → `/financeiro`,
instrutor → `/pedagogico`.

## 2. Server functions auditadas

Todas as fns abaixo passaram a compor a chain:
`.middleware([requireSupabaseAuth, requirePapel(<conjunto>)])`.
O helper `requirePapel` (em `src/lib/rbac-guard.ts`) consulta `user_roles`
através do cliente do usuário (RLS) e nega a chamada quando o papel real
não está na lista, mesmo que o handler use o admin client depois.

### Somente coordenação (`PAPEIS_COORDENACAO` = coordenador_geral, coordenador_pedagogico, administrativo)

- `mte-relatorios.functions.ts`: `consultarViewMTE`, `consultarExecucaoFisicoFinanceira`.
- `moodle-import.functions.ts`: `importarDumpMoodle`.
- `moodle-sync.functions.ts`: `sincronizarEmailsBeneficiariasFromAva`, `listarProfessoresUltimoAva`.
- `consolidado-qajbc.functions.ts`: `importarConsolidadoQajbc`.
- `oficio-49148.functions.ts`: `carregarPendenciasOficio49148`.
- `ciclo2-previsto.functions.ts`: `criarTurmasCiclo2Previstas`.
- `relatorio-parcial-objeto.functions.ts`: todas as 8 fns (criar/atualizar/gerar/exportar).
- `leitor-drive.functions.ts`: `baixarPdfDoDrive`.
- `ava-turmas.functions.ts`: `listarCursosSemTurma`.
- `ava-matriculas.functions.ts`: `gerarMatriculasDoAva`.
- `ava-beneficiarias.functions.ts`: `listarSugestoesBeneficiariasDoAva`, `criarBeneficiariasDoAva`.
- `editais-busca.functions.ts`: `buscarEditais`, `ultimaBusca`, `atualizarSituacaoEdital`.
- `drive-sync.functions.ts`: todas as 6 fns (varredura/processar/status/lista/marcar/reindexar).
- `whatsapp.functions.ts`: todas as 11 fns (criar/importar/processar/transcrever/analisar/publicar/vincular/purgar).
- `gdrive.functions.ts`: todas as 7 fns (verify/list/search/breadcrumb/import/create/upload).

### Coordenação + financeiro (`PAPEIS_COORDENACAO_E_FINANCEIRO`)

- `relatorios.functions.ts`: `gerarAnaliseAba` (análise IA das abas de relatório).
- `base-conhecimento.functions.ts`: escritas — `registerUploadedDocumento`, `deleteDocumentoById`, `criarAnotacao`, `indexarDocumento`.
- `certificados.functions.ts`: `gerarLoteCertificados`, `carregarElegiveisCertificado`.
- `ia.functions.ts`: `aiChat`, `listarProvedores`, `salvarProvedor`, `testarProvedor`, `listarPoliticas`, `salvarPolitica`, `listarConsumoIA`, `lerListaPresenca`.

### Aberto a todos os autenticados

- `base-conhecimento.functions.ts`: `buscarConhecimento` (busca semântica — professor pode consultar).
- `orbe.functions.ts`: todas as fns do Orbe. As **ferramentas** internas
  são filtradas por papel dentro do `orbeChat`:
  - instrutor (professor / auxiliar_pedagogico) só recebe:
    `listar_turmas`, `detalhar_turma`, `matriculas_da_turma`, `aulas_da_turma`,
    `frequencia_resumo`, `buscar_beneficiaria`, `buscar_conhecimento`,
    `etapas_status`, `pendencias`, `ajuda_sistema` — **todas** já com
    filtro `WHERE turma_id IN (turmas do usuário)` injetado via
    `__turmas_escopo`;
  - `financeiro_resumo` continua exclusivo de `coordenador_geral` /
    `gestor_financeiro`.
- `rbac.functions.ts`: leitura (`listarPermissoesMatriz`, `listarTurmasDoProjeto`)
  autenticada; escrita exige `coordenador_geral` (verificação interna).
- `users.functions.ts`: mantém checagem própria (coordenador_geral).

## 3. Ajustes de UI

- **Sidebar** (`app-sidebar.tsx`) filtra os itens pela matriz — sem mudança
  de código, porque já usava `canAccess`.
- **Guarda de rota** (`requireModuleAccess`) deixou de ser "fail-open" após
  o papel estar em cache: agora redireciona para o landing do papel.
- **`/` (Visão Geral)** ganhou `beforeLoad: requireModuleAccess("visao-geral")`
  — instrutores são redirecionados para `/pedagogico`.
- **Pedagógico → lista de turmas** já filtra por `instrutor_turmas` quando o
  papel é `professor`/`auxiliar_pedagogico` (parâmetro `soMinhasTurmas` de
  `turmasListOptions`).
- Demais telas de MTE/Financeiro/Configurações/Relatórios ficam bloqueadas
  para instrutor pela guarda de rota, sem tratamento por tela.

## 4. Como verificar

1. Logar como `professor` → conferir que a sidebar só mostra Pedagógico,
   Relação de Horas, Base de Conhecimento, Etapas, Ajuda.
2. Tentar `/mte`, `/financeiro`, `/relatorios`, `/configuracoes` na barra
   de URL → redirect para `/pedagogico` (sem toast).
3. No Orbe, pedir "listar todas as turmas" → só devem aparecer as turmas
   vinculadas via `instrutor_turmas`.
4. Logar como `coordenador_geral` → toda a matriz continua liberada.
5. `bunx tsgo --noEmit` deve rodar sem erros.

> Observação: RLS no banco continua sendo a defesa final. A chain
> `requireSupabaseAuth + requirePapel` protege os endpoints que usam o
> `service_role` (admin client) e que, portanto, ignorariam RLS.