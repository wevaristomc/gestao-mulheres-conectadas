## Problema

A exclusão pelo botão da lixeira usa `supabase.from("documentos").delete()` direto do cliente. Assim como acontecia no upload manual, esse caminho falha silenciosamente por RLS/permissões no schema atual (mesmos motivos do bug anterior: colunas variáveis como `autor_id`/`created_by`, políticas restritivas). O usuário confirma e nada acontece.

## Correção proposta

1. **Nova server function `deleteDocumentoById`** em `src/lib/base-conhecimento.functions.ts`:
   - Middleware `requireSupabaseAuth`.
   - Valida vínculo do usuário com o `projeto_id` do documento (mesma checagem de `user_roles` já usada no registro).
   - Usa `supabaseAdmin` (service_role) para:
     - Ler a linha (`id`, `projeto_id`, `storage_path`).
     - `DELETE` no `documentos` por `id`.
     - Remover o arquivo do bucket `documentos` (best-effort).
   - Retorna erro claro se algo falhar.

2. **Atualizar `src/routes/_authenticated/base-conhecimento.tsx`**:
   - Trocar `deleteDocumento(row)` na mutation por `deleteDocumentoById({ data: { id: row.id } })` via `useServerFn`.
   - Manter toast de sucesso/erro exibindo a mensagem real do servidor.
   - Fechar diálogo de confirmação apenas em sucesso.

3. **Limpeza**: remover ou marcar como deprecated a `deleteDocumento` client-side em `base-conhecimento-queries.ts` para evitar reuso.

## Verificação

- Clicar em remover → toast "Documento removido" e a linha some da tabela.
- Se o arquivo não existir mais no storage, a exclusão do registro ainda conclui.
- Se o usuário não tiver vínculo com o projeto, mensagem 403 clara.

Sem mudanças de schema, RLS ou UI além do fluxo de exclusão.