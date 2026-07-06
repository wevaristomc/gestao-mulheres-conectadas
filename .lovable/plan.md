## Objetivo

Conectar o Google Drive **institucional** do Projeto Mulheres Conectadas ao app, restrito a uma **pasta raiz** informada pela coordenação, com **leitura + upload**, disponível em 4 pontos do sistema.

## Arquitetura

- **Autenticação**: usar o **Standard Connector `google_drive`** do Lovable (uma única conexão OAuth feita por quem administra o Projeto). Todos os usuários do app enxergam o mesmo Drive.
- **Chamadas**: sempre via **connector gateway** (`https://connector-gateway.lovable.dev/google_drive/drive/v3/...`) dentro de **server functions** (`createServerFn` + `requireSupabaseAuth`) — o app nunca chama a API do Google diretamente e o `LOVABLE_API_KEY` fica no servidor.
- **Escopo da conexão**: pediremos scope de leitura + escrita (`drive.file` para arquivos criados/abertos pelo app; `drive` se a coordenação precisar navegar o Drive inteiro dentro da pasta raiz). Decisão final na hora do `connect`.
- **Pasta raiz**: guardada como **secret runtime** `GDRIVE_ROOT_FOLDER_ID`. Toda listagem/busca faz filtro `'<root>' in parents` (ou descendência) e todo upload usa `parents: [<subfolder>]` dentro dela.
- **Controle de acesso no app**: mesmas roles já existentes (`role-access.ts`). Escrita (upload/mover/renomear) somente para `coordenador_geral`, `coordenador_pedagogico`, `administrativo`.

## Passos de implementação

### 1. Setup da conexão
1. Chamar `standard_connectors--connect` com `connector_id: "google_drive"` — a coordenação escolhe/cria a conexão com a conta do Projeto.
2. Pedir ao usuário o **ID da pasta raiz** (URL `drive.google.com/drive/folders/<ID>`) e salvar via `add_secret` como `GDRIVE_ROOT_FOLDER_ID`.
3. Verificar credenciais com `verify_credentials` no gateway.

### 2. Camada de dados — `src/lib/gdrive.functions.ts` (server)
Server functions autenticadas (todas com `requireSupabaseAuth`):
- `listGdriveFolder({ folderId?, pageToken?, query? })` → lista arquivos/pastas (defaultando à raiz), campos `id,name,mimeType,size,modifiedTime,iconLink,webViewLink,thumbnailLink,parents`.
- `searchGdrive({ q, pageToken? })` → busca por nome/mime dentro da subárvore da raiz.
- `getGdriveFileMeta({ fileId })` → metadados + breadcrumb até a raiz (bloqueia se não descende da raiz — trava de segurança).
- `downloadGdriveFile({ fileId })` → baixa o binário via gateway (`?alt=media`) e retorna base64 + contentType; usado para importar.
- `importGdriveToBucket({ fileId, bucket, path })` → download + `supabaseAdmin.storage.from(bucket).upload(...)` (lazy import). Bucket destino: `documentos` (base de conhecimento) ou `evidencias`.
- `createGdriveFolder({ name, parentId? })`.
- `uploadToGdrive({ name, mimeType, base64, parentId? })` → multipart upload no endpoint `/upload/drive/v3/files?uploadType=multipart`.
- `moveGdriveFile({ fileId, newParentId })` (renomear/organizar — futuro).

Utilitário `src/lib/gdrive-helpers.ts` (server): headers do gateway, montagem de query `q`, validação "descende da raiz".

### 3. UI — componente reutilizável `<GDrivePicker />`
Modal com:
- breadcrumb de pastas (a partir da raiz),
- busca por nome,
- listagem paginada com ícones/mime, tamanho, data,
- multi-select,
- ação primária configurável: **"Importar para o app"** ou **"Anexar link"**.

Retorna array de `{ id, name, mimeType, webViewLink }`.

### 4. Pontos de integração

**a) Nova aba "Google Drive" na Base de Conhecimento** (`/base-conhecimento`)
- Segundo tab ao lado do listado atual do bucket `documentos`.
- Navegador do Drive (a partir da raiz) + botão **"Importar para a base"**: baixa o arquivo, sobe no bucket `documentos` e cria o registro em `public.documentos` (com `categoria` escolhida no import).
- Também aceita **link "referenciar sem baixar"** — grava `storage_path = null` + `webViewLink` no registro (requer coluna opcional; se não existir, exibe banner "adicione coluna `external_url` para usar links externos").

**b) Anexar do Drive em Evidências MTE** (`/mte/evidencias`)
- Botão **"Escolher do Drive"** ao lado do input de upload local.
- Ao selecionar, chama `importGdriveToBucket({ bucket: "evidencias", path: "<turma>/<uuid>-<nome>" })` e cria o registro na tabela `evidencias` com os mesmos campos (tipo, descrição, aula vinculada).

**c) Anexar do Drive em Entregas de Benefícios**
- No formulário de entrega (componente existente `entregas-tab.tsx`), botão **"Anexar comprovante do Drive"** — mesma mecânica: importa para bucket `evidencias` e vincula à entrega.

**d) Novo item de sidebar "Drive do Projeto"** (`/drive`)
- Entre "Base de Conhecimento" e "Configurações".
- Página com o `<GDrivePicker />` em modo navegação (sem seleção obrigatória) — atalho para abrir o Drive completo do Projeto, com botão **"Novo arquivo aqui"** (upload) e **"Nova pasta"** para coordenadores.
- Recentes: chama `listGdriveFolder` com `orderBy=modifiedTime desc`.

### 5. Segurança
- **Escrita** (`createGdriveFolder`, `uploadToGdrive`, `importGdriveToBucket`, `moveGdriveFile`) verifica role via `has_role` no início do handler — negação = 403.
- Toda listagem/download valida que o arquivo alvo está sob `GDRIVE_ROOT_FOLDER_ID` (via `parents` recursivo com cache de curta duração).
- `LOVABLE_API_KEY` e `GDRIVE_ROOT_FOLDER_ID` **nunca** vão ao browser (sempre via server function).
- Erros do gateway (401/403/404/quota) mapeados para mensagens amigáveis via `toast`.

### 6. Sidebar & role-access
- `src/components/app-sidebar.tsx`: novo item "Drive do Projeto" (ícone `HardDrive` do lucide-react) visível para roles com acesso ao módulo.
- `src/lib/role-access.ts`: registrar módulo `drive` (leitura para todos os autenticados; escrita restrita).

## Detalhes técnicos

**Env necessário no runtime do server:**
- `LOVABLE_API_KEY` (já existe)
- `GOOGLE_DRIVE_API_KEY` (injetado pelo connector após `connect`)
- `GDRIVE_ROOT_FOLDER_ID` (adicionado via `add_secret`)

**Headers do gateway (padrão):**
```
Authorization: Bearer ${LOVABLE_API_KEY}
X-Connection-Api-Key: ${GOOGLE_DRIVE_API_KEY}
```

**Endpoints usados:**
- `GET /drive/v3/files?q=...&fields=...&pageSize=50&pageToken=...`
- `GET /drive/v3/files/{id}?fields=id,name,mimeType,parents,webViewLink,size,modifiedTime`
- `GET /drive/v3/files/{id}?alt=media` (download binário)
- `POST /drive/v3/files` (criar pasta com `mimeType: application/vnd.google-apps.folder`)
- `POST /upload/drive/v3/files?uploadType=multipart` (upload)
- `PATCH /drive/v3/files/{id}?addParents=&removeParents=` (mover)

**Base de conhecimento — mudança mínima no schema (opcional):**
Se a coordenação quiser referenciar links do Drive sem baixar o arquivo, adicionar coluna opcional `external_url text` em `public.documentos` via migration. A UI detecta em runtime (padrão já usado em `base-conhecimento-queries.ts`) e mostra banner se ausente.

## Arquivos novos
- `src/lib/gdrive.functions.ts`
- `src/lib/gdrive-helpers.ts` (server-only)
- `src/lib/gdrive-queries.ts` (queryOptions client)
- `src/components/gdrive/gdrive-picker.tsx`
- `src/components/gdrive/gdrive-file-row.tsx`
- `src/routes/_authenticated/drive.tsx`
- `src/routes/_authenticated/base-conhecimento.tsx` (edit — adicionar tab Drive)

## Arquivos editados
- `src/components/app-sidebar.tsx` — novo item
- `src/lib/role-access.ts` — módulo `drive`
- `src/routes/_authenticated/mte.evidencias.tsx` — botão "Escolher do Drive"
- `src/components/entregas-tab.tsx` — botão "Anexar do Drive"

## Pré-requisitos que peço à coordenação
1. Confirmar qual conta Google será a "conta do Projeto" (recomendo criar `projeto.mulheresconectadas@...` se ainda não houver, para desacoplar de pessoa física).
2. Enviar o **link/ID da pasta raiz** no Drive (será salvo como secret).
3. No momento do `connect`, autorizar os scopes de leitura e escrita solicitados pelo Google.

## Fora de escopo (podemos fazer depois)
- Sincronização bidirecional automática (webhook do Drive) — Google exige verificação de domínio; se necessário, faço em segunda fase via `/api/public/webhooks/gdrive`.
- Preview inline de PDFs/planilhas (usar `webViewLink` por enquanto).
- Compartilhamento por permissões granulares dentro do Drive pelo próprio app.
