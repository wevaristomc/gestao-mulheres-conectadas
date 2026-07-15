# Plano — Leitor Assertivo de Listas de Presença

Objetivo: substituir a atual leitura em campo aberto (com risco de re-OCR de identidade) por uma leitura **ancorada no elenco impresso pelo sistema**, com **dupla passada de verificação**, **staging obrigatório** antes de gravar em `presencas`, **confronto forte com o sistema** (turma, data, professor, duplicidade, conflito com lançamentos manuais) e **importação em lote via Google Drive**.

Mantém compatibilidade total com importações antigas (registros sem `arquivo_hash`/`status_sugestao` continuam legíveis; layouts oficiais dos PDFs não mudam).

---

## 1. Migração (docs/migrations/leitor-assertivo.sql — o usuário aplica)

```sql
ALTER TABLE public.importacoes_presenca
  ADD COLUMN IF NOT EXISTS arquivo_hash text,
  ADD COLUMN IF NOT EXISTS confianca_media numeric,
  ADD COLUMN IF NOT EXISTS status_sugestao text NOT NULL DEFAULT 'sugerida'
    CHECK (status_sugestao IN ('sugerida','confirmada','rejeitada')),
  ADD COLUMN IF NOT EXISTS confirmado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_importacoes_presenca_hash
  ON public.importacoes_presenca(arquivo_hash)
  WHERE arquivo_hash IS NOT NULL AND status_sugestao <> 'rejeitada';

-- Nova política de IA para a passada de verificação
INSERT INTO public.ia_politicas (processo, descricao, prioridade, provedor_preferido, max_tokens)
VALUES ('leitura_lista_verificacao', 'Verificação (2ª passada) da leitura de lista de presença',
        'media', 'gemini', 4096)
ON CONFLICT (processo) DO NOTHING;
```

Backfill implícito: linhas antigas ficam com `status_sugestao='sugerida'` (default) mas `arquivo_hash IS NULL`, então não são bloqueadas pelo índice único. UI trata `null` como "confirmada legada" para não quebrar histórico.

---

## 2. `lerListaPresenca` — closed-set (fecha o gargalo de OCR de identidade)

Arquivo: `src/lib/ia.functions.ts`

- Input passa a aceitar `elenco: { ordem, nome, cpf }[]` (matrículas ativas da turma). Compat: se ausente, mantém o comportamento atual (fallback para importações fora do fluxo novo).
- Prompt reescrito:
  - "Cada linha impressa corresponde a exatamente UMA cursista deste elenco (fornecido)".
  - Para cada linha retornar somente: `num_linha`, `elenco_ordem` (índice do elenco, ou `null`), `frequencia_sim`, `lanche_sim`, `assinatura_presente`, `confianca` (0–1). **Não** re-extrair `nome`/`cpf`.
  - Cabeçalho: manter `turma/data/horario/conteudo/instrutor/ch_dia/endereco` + novo campo `quantidade_presentes_manuscrita` (número escrito à mão no rodapé) + `confianca_cabecalho`.
- Resposta serializada: server hidrata `nome`/`cpf` das linhas pelo `elenco_ordem` antes de devolver ao cliente — o shape público (`AlunaExtraida`) permanece igual para o cruzamento existente, mas com um `confianca` novo e um `elenco_ordem` opcional.

---

## 3. Segunda passada de verificação

Arquivo: `src/lib/ia.functions.ts` (nova function `verificarListaPresenca`).

- Recebe imagens + resultado da 1ª passada + elenco.
- Prompt: "confira linha a linha as marcas manuscritas; retorne apenas correções (`num_linha`, campos alterados) e `total_presentes_contado`".
- Merge no cliente (`leitor-lista.ts`):
  - Linhas corrigidas → `confianca = min(confianca, 0.55)` e `flag: 'verificar'`.
  - Se `total_presentes_contado` divergir da `quantidade_presentes_manuscrita` do cabeçalho **ou** do total marcado pela 1ª passada → aviso forte em `observacoes` ("Divergência de contagem: X marcado / Y manuscrito / Z verificação").

`confianca_media` = média das linhas identificadas, persistida no staging.

---

## 4. Qualidade de imagem

Arquivo: `src/lib/leitor-lista.ts` — `arquivoParaImagensBase64`.

- Escala dinâmica: `scale = clamp(2200 / viewport.width, 2, 4)` (targeting ~2200px de largura por página).
- Se PNG resultante > ~4MB, refaz como `image/jpeg` qualidade 0.9 (`canvas.toDataURL('image/jpeg', 0.9)`).
- SHA-256 do arquivo original (`crypto.subtle.digest`) exposto por `hashArquivo(file)`.

---

## 5. Confronto forte com o sistema (pré-conferência)

Novo helper `src/lib/leitor-confronto.ts` (chamado pela página após leitura):

- **Turma**: normalizar `cabecalho.turma` (remove "Turma:", trim, uppercase) e comparar com `codigo_turma`/`nome_curso` → se divergir, retornar um aviso `bloqueante` que a UI impede confirmar até o operador confirmar manualmente a turma.
- **Data**: buscar aulas da turma (`aulas.data`) — se `cabecalho.data` não corresponde a nenhuma aula existente **nem** ao cronograma previsto (`turmas.dias_semana`/janela do curso), aviso forte não-bloqueante.
- **Instrutor**: comparar `cabecalho.instrutor` com `turmas.professor_nome` (Levenshtein simples ≥ 0.7 normalizado) → aviso.
- **Duplicidade por hash**: `select id, criado_em from importacoes_presenca where arquivo_hash = $1 and status_sugestao <> 'rejeitada' limit 1` → aviso forte com link para o registro.
- **Conflito com lançamentos manuais**: se a aula já tem `presencas`, o helper monta um DIFF `{ matricula_id, atual, sugerido }` para a UI mostrar por linha e exigir escolha por linha antes de gravar.

Todos os avisos entram em `observacoes` com um nível (`info`|`atencao`|`bloqueante`) para a UI destacar.

---

## 6. Staging obrigatório (sugestão → confirmação)

`src/lib/leitor-lista.ts`:

- Nova função `criarSugestao(input)`: insere em `importacoes_presenca` com `status_sugestao='sugerida'`, `arquivo_hash`, `confianca_media`, `itens`, cabeçalho, avisos — **sem** tocar em `presencas`/`entregas_beneficios`/`evidencias`.
- `confirmarImportacao(sugestaoId, decisoesPorLinha)`:
  - Carrega a sugestão, valida `status_sugestao='sugerida'`.
  - Para cada linha, respeita a decisão do operador (manter atual / sobrescrever / ignorar). Nunca sobrescreve linhas sem decisão explícita de sobrescrita.
  - Executa o pipeline atual (upsert aula, presencas, lanches, evidência) e marca `status_sugestao='confirmada'`, `confirmado_por=auth.uid()`, `confirmado_em=now()`.
- `rejeitarSugestao(id, motivo)`: marca `status_sugestao='rejeitada'` (libera o hash para reimportação).

UI (`src/routes/_authenticated/mte.importar-lista.tsx`):

- Painel de conferência lado a lado (imagem da página + tabela).
- Badge de confiança por linha: verde ≥ 0.85, amarelo 0.6–0.85, vermelho < 0.6.
- Filtro "só duvidosas" e botão "Aceitar todas com confiança ≥ 0.85" (marca decisão em massa).
- Botão "Confirmar" só habilita quando não há avisos `bloqueante` pendentes de reconhecimento.
- Bloco de conflitos: para cada linha com valor manual atual ≠ sugerido, radio "manter manual / usar sugerido".

Notificação para coordenação: reuso da tabela `notificacoes` já existente (uma entrada por sugestão criada, tipo `sugestao_lista`).

---

## 7. Lote do Google Drive

Nova aba "Do Drive" na página do leitor.

- Query: `drive_arquivos` filtrando `pasta_caminho ILIKE '%lista%'` **AND** `pasta_caminho ILIKE '%presen%'` (dois `ilike` para pegar variações "lista_presenca", "listas de presença"), `mime_type = 'application/pdf'`, ordenado por `pasta_caminho, nome`.
- Agrupado por mês (extraído de `pasta_caminho` ou `modified_time`).
- Multi-seleção + botão "Ler e confrontar selecionados" → fila FIFO no cliente que processa 1 PDF por vez, chamando o mesmo pipeline (leitura → verificação → confronto → `criarSugestao`).
- Progresso: barra + lista com status por arquivo (`aguardando`, `lendo`, `verificando`, `sugestao_criada`, `erro`). Confirmação manual continua obrigatória por sugestão (o lote não confirma automaticamente).

---

## 8. Documentação

`docs/AUDITORIA-BUGS.md`: nova seção "Rodada 3 — Leitor Assertivo" descrevendo (a) closed-set, (b) 2ª passada, (c) staging, (d) confronto, (e) lote Drive; marca P13 (novo) como corrigido.

---

## Detalhes técnicos

**Compatibilidade retroativa**
- `importacoes_presenca` antigas: `status_sugestao` default 'sugerida' + `arquivo_hash IS NULL`. A UI de histórico considera qualquer registro criado antes da migração (identificado por `confianca_media IS NULL AND arquivo_hash IS NULL`) como "legado — já gravado" e não oferece botão de confirmar.
- `confirmarImportacao` antiga (sem `sugestaoId`) permanece exportada mas marca-se como deprecated no comentário; nenhum chamador do app usa mais, apenas fallback.

**Hash do arquivo**
- Uso de `crypto.subtle.digest('SHA-256', arrayBuffer)` no cliente; hex de 64 chars.

**Segurança**
- Todas as chamadas continuam sob RLS existente (`importacoes_presenca_all_staff`). Nova coluna `confirmado_por` não altera policies.
- Nenhuma nova rota pública.

**Typecheck**
- Tipos novos: `LinhaSugerida`, `AvisoConfronto`, `DecisaoLinha`. Nenhum `any` novo.

## Ordem de execução

1. Criar `docs/migrations/leitor-assertivo.sql`.
2. Atualizar `src/lib/ia.functions.ts` (closed-set + verificação).
3. Atualizar `src/lib/leitor-lista.ts` (imagens, hash, staging, split entre `criarSugestao` e `confirmarImportacao`).
4. Criar `src/lib/leitor-confronto.ts`.
5. Reescrever `src/routes/_authenticated/mte.importar-lista.tsx` (confiança, diff, aba Drive).
6. Atualizar `docs/AUDITORIA-BUGS.md`.
7. Typecheck.

Não altero: layouts de PDF, RBAC/RLS, seed das etapas.
