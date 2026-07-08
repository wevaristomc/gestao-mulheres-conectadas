## Problema

Ao selecionar 22 arquivos no `GDrivePicker` da Base de Conhecimento e clicar em **Usar arquivos**, aparentemente nada acontece. Na verdade a mutação `importFromDrive` está rodando (baixa cada arquivo do Drive via server function, faz upload no bucket `documentos` e insere linha em `documentos`) — mas:

- O botão "Usar arquivos" não fica em estado de carregamento.
- O diálogo continua aberto, sem barra de progresso nem contador (X de 22).
- Não há `toast.loading` durante a operação, só `toast.success` no fim.
- Se um item selecionado for uma pasta (edge case), a chamada falha silenciosamente no meio do laço.

## O que vou mudar

### 1) `src/components/gdrive/gdrive-picker.tsx`
- Nova prop opcional `busy?: boolean` e `progress?: { done: number; total: number } | null`.
- Enquanto `busy`:
  - "Usar arquivos" mostra spinner + texto `Importando… (X/Y)`.
  - Botões "Cancelar", fechar (X do Dialog) e navegação de pastas ficam desabilitados.
  - `onOpenChange` é ignorado (não fecha por clique fora / ESC).
- Filtrar pastas ao confirmar: `Object.values(selected).filter(f => f.mimeType !== FOLDER_MIME)`; se sobrar zero, mostra erro amigável.

### 2) `src/routes/_authenticated/base-conhecimento.tsx`
- Adicionar `useState` `importProgress = { done, total }`.
- Reescrever `importFromDrive.mutationFn` para atualizar `importProgress` a cada arquivo processado e capturar falhas individuais em `results.failed[]` sem abortar o lote (Promise sequencial com try/catch por item).
- Emitir um `toast.loading` fixo (id estável) atualizando a mensagem `Importando X de Y…`; substituir por `toast.success`/`toast.error` no `onSettled` com resumo (`N importados, M falharam`).
- Passar `busy={importFromDrive.isPending}` e `progress={importProgress}` ao `GDrivePicker`.
- Fechar o picker somente em `onSettled` quando houver ao menos um sucesso.

### 3) Sem mudanças em backend / server functions
Não altero `importGdriveToBucket`, `gdrive-helpers.server.ts`, tabela `documentos`, buckets ou RLS. Apenas UX/estado no cliente.

## Fora do escopo

- Paralelizar downloads (mantém sequencial para não estourar rate limit do Google Drive).
- Retomar importação em caso de erro parcial.
- Mudanças em outros consumidores do `GDrivePicker` (o novo prop `busy` é opcional e retrocompatível).
