
# WhatsApp Insights — ingestão de exports do projeto

Objetivo: coordenação exporta um chat de grupo do WhatsApp (.zip com `_chat.txt` + mídias), sobe no app, e o sistema:
1) processa mensagens, áudios (transcrição) e imagens (OCR/descrição),
2) casa números com beneficiárias cadastradas (preenchendo o WhatsApp da aluna),
3) gera relatório prévio do período (temas, presença mencionada, dúvidas, alertas).

Feito em **6 fases pequenas**, 1 build por fase.

---

## Fase W0 — Esquema + storage (SQL + bucket)

Tabelas novas em `public`:
- `wa_grupos` — cadastro dos grupos (nome, `projeto_id`, `turma_id?`, observações).
- `wa_importacoes` — 1 linha por .zip enviado (grupo, arquivo, período detectado, status, contadores).
- `wa_mensagens` — 1 linha por mensagem do `_chat.txt` (timestamp, remetente_nome, remetente_fone_e164, tipo=texto|audio|imagem|video|doc|sistema, conteudo_texto, midia_path).
- `wa_midias_analise` — resultado por mídia (transcricao, ocr_texto, descricao_ia, modelo, custo/token, erro).
- `wa_resumos` — resumos gerados por período (grupo, data_inicio, data_fim, markdown, autor_ia).

Todas com `GRANT` para `authenticated` + `service_role`, `RLS on`, políticas via `has_role`/pertinência ao projeto (padrão do app). Índices em `(grupo_id, timestamp)` e `remetente_fone_e164`.

Bucket **privado** `whatsapp` no Storage:
- `imports/{importacao_id}/original.zip`
- `imports/{importacao_id}/media/<arquivo>`  
Políticas: leitura/escrita apenas para `authenticated` com papel adequado (coordenador/admin).

**Riscos:** conflito com RLS existente se `projetos`/`turmas` mudarem nomes de colunas — mitigado usando `select("*")` como fizemos em `rbac.functions.ts`.

---

## Fase W1 — Upload + parser do `_chat.txt`

- Rota `/_authenticated/whatsapp` (submenu novo na sidebar, gated por papéis coordenador/admin).
- Tela lista grupos + botão “Nova importação”: escolhe grupo (ou cria), faz upload do `.zip`.
- Server function `importarZipWhatsapp`:
  - salva zip no bucket, descompacta em memória (JSZip),
  - parseia `_chat.txt` (formatos iOS/Android, PT-BR; regex tolerante a `[dd/mm/aa hh:mm:ss]` e `dd/mm/aaaa hh:mm -`),
  - normaliza telefones para E.164 (`libphonenumber-js`, default BR),
  - insere `wa_mensagens` em lote e sobe cada mídia para `imports/{id}/media/`.
- Retorna contadores (msgs, áudios, imagens, remetentes únicos). Sem IA ainda.

**Riscos:** zips grandes (>50MB) podem estourar limite do Worker — fase W1 processa síncrono até ~30MB; acima disso mostra erro e recomenda dividir. (Chunking fica para melhoria futura.)

---

## Fase W2 — Transcrição de áudios

- Server function `transcreverAudiosImportacao(importacaoId)` — dispara em background após o upload (com botão “Reprocessar” manual).
- Para cada mídia `.opus/.ogg/.m4a/.mp3`:
  - baixa do bucket, envia a `POST https://ai.gateway.lovable.dev/v1/audio/transcriptions` com `openai/gpt-4o-mini-transcribe`, sem `language` (auto-detect),
  - guarda `transcricao` + `usage` em `wa_midias_analise`, atualiza `wa_mensagens.conteudo_texto` com a transcrição prefixada por `[áudio] `.
- UI mostra progresso (`n/total`) e permite reexecutar somente as com erro.

**Riscos:** OGG/Opus é aceito pelo `gpt-4o-mini-transcribe`; se algum vier em formato exótico, marcamos `erro` e seguimos.

---

## Fase W3 — OCR/descrição de imagens

- Server function `analisarImagensImportacao(importacaoId)`:
  - para cada `.jpg/.png/.webp`, gera signed URL curta e chama `google/gemini-3-flash-preview` via `/v1/chat/completions` multimodal,
  - prompt fixo pedindo: (a) texto legível na imagem (OCR), (b) descrição objetiva do conteúdo, (c) se parece lista de presença/cartaz/comprovante — classificação em `tipo_provavel`.
- Grava em `wa_midias_analise`. UI mostra thumbnail + texto extraído; botão “usar como evidência da turma X” cria linha em `evidencias` reaproveitando o arquivo do bucket.

**Riscos:** custo por imagem — mostrar contador e permitir “analisar só selecionadas”.

---

## Fase W4 — Vínculo telefone → beneficiária

- Página “Vincular remetentes”: lista `remetente_fone_e164` da importação com contagem de mensagens e nome exibido no WhatsApp.
- Para cada telefone:
  - busca automática em `beneficiarias` por telefone/WhatsApp já cadastrado (match exato E.164 e por 8 últimos dígitos),
  - se sem match, mostra combobox para escolher aluna manualmente (busca por nome/CPF),
  - ação “Confirmar vínculo” grava `beneficiaria_id` em `wa_mensagens` (batch pelo telefone) **e** atualiza `beneficiarias.whatsapp` se estiver vazio.
- Guardamos também um dicionário `wa_contatos (fone_e164, beneficiaria_id, projeto_id)` para reaproveitar em importações futuras.

**Riscos/LGPD:** telefones de participantes não vinculados ficam armazenados (o usuário optou por “armazenar tudo cru”). Deixamos aviso na tela e uma ação “Purgar importação” que apaga zip, mídias e linhas.

---

## Fase W5 — Relatório prévio por IA

- Aba “Relatório do período” dentro do grupo: seletor de data_inicio/data_fim.
- Server function `gerarResumoGrupo({grupoId, inicio, fim})`:
  - agrega mensagens do período (texto + transcrições + OCRs),
  - envia contexto limitado a ~12k caracteres para `google/gemini-3-flash-preview` com prompt estruturado:
    - **Temas recorrentes**, **Menções de presença/faltas**, **Dúvidas mais frequentes**, **Alertas (evasão, conflito, questões sensíveis)**, **Sugestões para a coordenação** — mesmo padrão do `gerarAnaliseAba`.
  - salva em `wa_resumos` (markdown) e exibe. Botão para exportar como .md/.pdf.

**Riscos:** contexto pode exceder — cortamos por período/turma; grupos muito ativos exigem janelas menores.

---

## Fora do escopo (para depois)
- Ingestão em tempo real (Cloud API/Evolution) — usuário escolheu export manual.
- Vídeos: guardamos o arquivo mas não analisamos automaticamente na V1.
- Anonimização/mascaramento — o usuário pediu “armazenar tudo cru”; deixamos a purga como saída de emergência.

---

## Detalhes técnicos resumidos

- **Stack:** rotas em `src/routes/_authenticated/whatsapp.*.tsx`, server fns em `src/lib/whatsapp.functions.ts`, helpers de parse/telefone em `src/lib/whatsapp-parser.ts`, storage helpers em `src/lib/whatsapp-storage.server.ts`.
- **Deps novas:** `jszip` (já pode estar), `libphonenumber-js`.
- **Modelos IA:** `openai/gpt-4o-mini-transcribe` (áudio), `google/gemini-3-flash-preview` (visão + resumo). Ambos via `LOVABLE_API_KEY`, server-side.
- **Permissões:** todas as rotas exigem papel `admin`/`coordenador` via `requireModuleAccess`.
- **SQL de apoio:** entrego bloco no chat para você aplicar no banco antes da W0 se preferir, ou deixo migration na Fase W0 pelo próprio app.

Ao final das 6 fases: publicação.
