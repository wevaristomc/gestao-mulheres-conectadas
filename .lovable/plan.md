## Diagnóstico

**1. HTTP 429 (Google Drive)** — `gwFetch` em `src/lib/gdrive-helpers.server.ts` faz cada chamada sem retry. Uma varredura profunda dispara centenas de `listChildren`/`getMeta` em sequência rápida e o gateway devolve 429; o erro sobe direto e aborta a varredura inteira. O download em massa (`downloadFileBase64`) e o picker (`listGdrive`/`searchGdrive`) sofrem o mesmo problema.

**2. "Falha ao registrar documento"** — em `inserirDocumentoDrive` (drive-sync.functions.ts) o retry só sabe tratar erro de "coluna inexistente". Qualquer outra falha (NOT NULL, chave estrangeira, RLS, mensagem 429 no OCR retornando texto vazio, etc.) cai no `throw` genérico com pouca informação. O erro real fica escondido em `drive_arquivos.erro` truncado e não aparece na UI de forma útil.

**3. Botão "Sincronizar agora" sem feedback** — o `disabled` depende de `progresso`, que só é setado *depois* que `varreduraFn()` termina. Enquanto a varredura roda (pode ser 10–60s) o botão continua clicável, sem spinner e sem barra de progresso; parece "morto". O toast `loading` existe mas fica escondido em canto de tela.

**4. Botão "Importar do Drive"** — abre o `GDrivePicker`, que chama `listGdrive`. Se o gateway devolve 429 na primeira chamada, o dialog exibe erro interno mas pode dar impressão de que "não funciona". Depois de corrigir o backoff, ele volta a listar.

## Correções

### A. Retry com backoff no gateway do Drive — `src/lib/gdrive-helpers.server.ts`
- Envolver `gwFetch` num helper `withRetry` que:
  - Repete em `429` e `5xx` (até 5 tentativas).
  - Respeita `Retry-After` do header quando presente.
  - Backoff exponencial com jitter: 500ms, 1s, 2s, 4s, 8s (cap 10s).
  - Não repete em `4xx` que não seja 429.
- Adicionar throttle mínimo (~120ms) entre chamadas dentro de `listRecursive` para evitar disparar o próximo rate-limit imediatamente.
- Aumentar `pageSize` de `listChildren` para 500 (menos requests para o mesmo total).

### B. `driveSyncVarredura` mais resiliente — `src/lib/drive-sync.functions.ts`
- Pequeno `sleep(150ms)` entre páginas de upsert também.
- Se `listRecursive` falhar no meio, gravar em `drive_sync_estado.resumo` o erro e o total parcial já catalogado, para o usuário ver.

### C. `driveSyncProcessar` — melhor tratamento de falhas
- Envolver cada extração (OCR/transcrição/download) num try interno que salva mensagem detalhada em `drive_arquivos.erro` (sem truncar a causa raiz; até 800 chars).
- Se `inserirDocumentoDrive` falhar, propagar a mensagem real (ex.: "null value in column X", "row-level security", "duplicate key") em vez de apenas "Falha ao registrar documento".
- Detectar 429 no OCR de PDF/imagem e marcar o item como `pendente` (não `erro`) para tentar de novo depois — evita "queimar" o arquivo.
- Reduzir `MAX_BATCH` de 5 para 3 e adicionar `sleep(300ms)` entre itens.

### D. UI do painel — `src/components/base-conhecimento/drive-sync-panel.tsx`
- Trocar o `async function rodarSincronizacao` por `useMutation` (`syncMutation`) para ter `isPending` confiável.
- `disabled={!projetoId || syncMutation.isPending}` + spinner grande no botão enquanto roda.
- Inserir uma **barra de progresso visível** logo abaixo do KPI (não só toast): "Varrendo Drive…" → "Catalogados N arquivos" → "Processados X de Y — restam Z", com `<Progress>` do shadcn.
- Exibir erro do backend em card destacado quando `syncMutation.error` (não só toast) para o usuário conseguir ler.
- Rodar até 10 lotes (em vez de 5) enquanto `restantes > 0`, com pequeno delay entre eles.
- Remover o auto-sync silencioso das primeiras 6h que pode competir com o clique manual (só dispara se `!syncMutation.isPending`).

### E. "Importar do Drive" — sem alteração de comportamento, apenas se beneficia do backoff
- Confirmar que o picker abre; após A, as listagens deixam de falhar por 429. Não mexer no fluxo.

## Não muda
- Migração `docs/migrations/drive-sync.sql` (já aplicada).
- Esquema de `documentos` / `drive_arquivos` / `ia_politicas`.
- Ferramenta do Orbe `buscar_base_conhecimento`.
- Fluxos de RBAC, upload manual, anotações.

## Arquivos a alterar

```text
src/lib/gdrive-helpers.server.ts        (retry/backoff + throttle)
src/lib/drive-sync.functions.ts         (mensagens de erro, MAX_BATCH, 429→pendente, sleeps)
src/components/base-conhecimento/drive-sync-panel.tsx  (mutation, barra de progresso, banner de erro)
```

## Critérios de aceite
- Clicar "Sincronizar agora" mostra imediatamente spinner + barra de progresso; botão fica desabilitado até terminar.
- Erros 429 do Google Drive não abortam mais a varredura; aparecem no máximo como atraso.
- Itens que falham exibem a causa real (não "Falha ao registrar documento" genérico).
- "Importar do Drive" abre o picker e lista pastas sem erro em execução normal.
- Typecheck limpo.
