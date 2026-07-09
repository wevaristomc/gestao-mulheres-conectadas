
# Base de Conhecimento Expandida — Relatórios externos, anotações e áudios

Objetivo: transformar a Base de Conhecimento em um repositório multi‑formato (PDF, DOCX, imagens, anotações livres, áudios de WhatsApp) que alimenta os relatórios gerados pelo app e o Orbe Neural via RAG (busca semântica).

Ponto de partida: já existem tabela `documentos`, bucket privado `documentos`, upload/import Drive, e o Orbe com ferramentas de IA (`executarAiRouter`).

---

## 1. Modelo de dados (migração `docs/migrations/base-conhecimento-plus.sql`, idempotente)

Aditivo à tabela `documentos` — sem quebrar UI atual:

- `formato text` — `arquivo` | `anotacao` | `audio` | `link_externo` (default `arquivo`).
- `origem text` — `upload` | `gdrive` | `whatsapp` | `manual` (default `upload`).
- `conteudo_texto text` — corpo da anotação OU transcrição do áudio OU texto extraído de PDF/DOCX.
- `transcricao_status text` — `pendente` | `processando` | `concluida` | `erro`.
- `duracao_segundos int` — quando áudio.
- `metadata jsonb default '{}'` — chats WhatsApp (contato, data mensagem, importacao_id), páginas, autor, etc.
- `tags text[] default '{}'` — livre.

Nova categoria no enum do frontend (`CATEGORIAS`): `anotacoes`, `audios_whatsapp`, `relatorios_externos`.

Nova tabela `documentos_chunks` (RAG):
- `id uuid pk`, `documento_id uuid ref documentos(id) on delete cascade`
- `projeto_id uuid` (herda; usado por RLS)
- `ordem int`, `texto text`, `tokens int`
- `embedding vector(1536)` (usa `openai/text-embedding-3-small` para caber em índice HNSW direto)
- índice HNSW `vector_cosine_ops`
- RLS: SELECT/INSERT/DELETE por membro do projeto (mesma política de `documentos`).

Função RPC `match_documentos_chunks(projeto_id uuid, query_embedding vector(1536), match_count int)` retornando top‑k com `similarity`, join em `documentos` para título/categoria/link.

GRANTs padrão (`authenticated`, `service_role`) e políticas RLS espelhando `documentos`.

---

## 2. Servidor — ingestão e enriquecimento (`src/lib/base-conhecimento.functions.ts`)

Novas server functions (todas com `requireSupabaseAuth`):

- `criarAnotacao({ projetoId, titulo, categoria, corpo, tags })` — insere `documentos` com `formato='anotacao'`, `conteudo_texto=corpo`, dispara indexação.
- `uploadAudioWhatsapp({ projetoId, storagePath, nomeArquivo, mimeType, tamanhoBytes, duracao, metadata })` — registra `formato='audio'`, `transcricao_status='pendente'`, enfileira transcrição.
- `transcreverDocumento({ documentoId })` — baixa arquivo do bucket, chama `openai/gpt-4o-mini-transcribe` via `ai.gateway.lovable.dev/v1/audio/transcriptions` (áudio) OU extrai texto de PDF/DOCX/TXT (Node via `pdf-parse` já usado no projeto, ou parser textual simples). Grava `conteudo_texto` + status.
- `indexarDocumento({ documentoId })` — chunking (≈1200 chars, overlap 150), embeddings via `google/gemini-embedding-001` **ou** `openai/text-embedding-3-small` (escolho o `-small` p/ manter 1536 dim e permitir HNSW direto), grava em `documentos_chunks`.
- `reindexarProjeto({ projetoId })` — utilidade admin.
- `buscarConhecimento({ projetoId, query, k=8, categorias? })` — embed da query, chama RPC `match_documentos_chunks`, retorna trechos + refs (id, título, link assinado).

Pipeline automático: após `registerUploadedDocumento`/`criarAnotacao`/`uploadAudioWhatsapp`, chama `transcreverDocumento` (se aplicável) → `indexarDocumento`, sequencialmente. Falhas marcam status e não bloqueiam o upload.

Importador WhatsApp (`src/lib/whatsapp.functions.ts` já existe): estender o processamento do ZIP para, quando `metadata.enviar_para_base=true`, criar `documentos formato='audio'` para cada `.opus/.mp3/.m4a` e `formato='anotacao'` consolidada com o texto da conversa (opcional, via checkbox na tela de import).

---

## 3. Frontend — Base de Conhecimento (`src/routes/_authenticated/base-conhecimento.tsx`)

Tabs / ações novas, sem mudar o layout atual:

- Botão **"Nova anotação"** → dialog com título, categoria, textarea (markdown simples), tags.
- Botão **"Áudio/gravação"** → dialog com dois modos:
  - Upload de arquivo de áudio.
  - Gravação in‑app (reaproveitar `MediaRecorder` do Orbe).
- Coluna **Formato** (ícone: 📄 arquivo · 📝 anotação · 🎧 áudio · 🔗 link).
- Coluna **Indexação**: badge `pendente/processando/pronto/erro`; botão "Reindexar" na linha.
- Filtro por formato além de categoria; busca já existente (`titulo/descricao`) passa a incluir `conteudo_texto` (server‑side ILIKE).
- Painel lateral "Buscar no conteúdo" (semântico): input livre → chama `buscarConhecimento` e mostra trechos com destaque + link para o documento.
- No importador WhatsApp existente: checkbox "Enviar áudios e conversa para a Base de Conhecimento" na tela `/whatsapp/*`.

---

## 4. Uso nos relatórios (`src/lib/relatorios.functions.ts` + tela `/relatorios/*`)

Cada geração de relatório (pedagógico, MTE, orçamentário, indicadores):

- Antes de montar o prompt do LLM, chama `buscarConhecimento({ projetoId, query: <resumo do relatório + período>, k: 10, categorias: [...] })`.
- Trechos recuperados vão para o prompt como bloco `## Contexto adicional (Base de Conhecimento)` com citações `[Doc: titulo]`.
- No output do relatório, incluir seção "Fontes complementares" listando os documentos usados (link assinado, formato, data).
- Nova opção na UI do gerador de relatório: "Incluir contexto da Base de Conhecimento" (default: ligado), com multiselect de categorias e filtro por tags.
- O Orbe (`orbe.functions.ts`) ganha ferramenta `buscar_conhecimento(query, categorias?)` que chama o mesmo endpoint — Jarvis passa a citar anotações/áudios/relatórios externos.

---

## 5. Infra e segurança

- Bucket `documentos` permanece privado; áudios reutilizam o mesmo bucket com prefixo `<projeto>/audios/`.
- Chamadas ao AI Gateway feitas server‑side com `LOVABLE_API_KEY` (já configurado). Nunca do cliente.
- Áudios acima de 25 MB: dividir server‑side em janelas de ~10 min antes de transcrever, concatenando texto.
- Custos: transcrição e embeddings sujeitas ao gateway; expor toggle "IA desligada" (fallback: apenas texto/ILIKE, sem RAG).
- Logs: novo tipo em `notificacoes` (`base_conhecimento_erro`) quando transcrição/indexação falhar.

---

## 6. Entregáveis por fase

Fase 1 — Fundação (bloqueia demais):
1. Migração `base-conhecimento-plus.sql` (colunas + tabela `documentos_chunks` + RPC + RLS).
2. Server functions `criarAnotacao`, `transcreverDocumento`, `indexarDocumento`, `buscarConhecimento`.
3. UI: "Nova anotação" e coluna formato/indexação.

Fase 2 — Áudios:
4. Server function `uploadAudioWhatsapp` + integração `MediaRecorder` no dialog.
5. Extensão do importador WhatsApp (checkbox + criação em lote).

Fase 3 — Relatórios & Orbe:
6. Injeção de RAG nas server functions de relatórios + toggle na UI.
7. Ferramenta `buscar_conhecimento` no Orbe.

---

## Detalhes técnicos

- Modelo de embedding: `openai/text-embedding-3-small` (1536 dims) para permitir índice HNSW direto (`vector(1536)`); caso mude para Gemini 3072 depois, ajustar coluna para `halfvec(3072)`.
- Chunking: parágrafo/sentença, 800–1500 chars, overlap ~150; áudios chunk por segmentos de fala quando disponível.
- Extração de PDF: usar `pdf-parse` (server-only) via `*.server.ts`; DOCX via `mammoth`.
- Todas as server functions retornam DTOs planos, sem `Response`/streams.
- Splitting: manter regra do projeto — imports de `client.server` só dentro de `.handler()`.
- Não alterar `src/integrations/supabase/*` gerados.

Aceite:
- Anotação criada aparece na busca semântica e em relatório gerado logo em seguida.
- Áudio enviado (upload ou gravado) fica com status `pronto` e sua transcrição é citada num relatório de teste.
- Importador WhatsApp, com o toggle ligado, popula a base com áudios da conversa selecionada.
- Nenhuma rota/tela existente muda visualmente além dos pontos listados.
