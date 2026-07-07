## Objetivo

Reconectar o frontend ao projeto Supabase onde os dados reais existem (`yqvocpnvunaprpmhlswn`) para eliminar o banner "Backend não conectado" e permitir login + queries funcionais.

## Contexto

- `.env` atual aponta para `ahgcdtnpdfkcrjkxclhb` (projeto gerenciado, schema vazio).
- Dados reais (turmas, aulas, matriculas, beneficiarias, ia_politicas, has_role, buckets etc.) já vivem em `yqvocpnvunaprpmhlswn`.
- Banner surge de `isBackendConnected = !!user` — sem sessão válida no projeto certo, ele nunca some.
- `src/integrations/supabase/client.ts` e `auth-middleware.ts` já usam `yqvocpnvunaprpmhlswn` como fallback hard-coded; falta alinhar `.env` e `config.toml`.

## Mudanças

1. **`.env`** — atualizar as 8 variáveis para `yqvocpnvunaprpmhlswn`:
   - `SUPABASE_URL` / `VITE_SUPABASE_URL` → `https://yqvocpnvunaprpmhlswn.supabase.co`
   - `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` → `yqvocpnvunaprpmhlswn`
   - `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` / `VITE_*` → a **anon/publishable key do projeto yqvocpnvunaprpmhlswn** (preciso que você cole nesta thread — não tenho acesso a ela; a key atual `sb_publishable_Nm8_1na...` é do projeto errado).

2. **`supabase/config.toml`** — trocar `project_id` para `yqvocpnvunaprpmhlswn`.

3. **Secrets de servidor** — verificar/atualizar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `ADMIN_SERVICE_ROLE_KEY` para apontarem ao projeto correto (necessário para `createServerFn` que usa `requireSupabaseAuth` e para o cliente admin do OCR/relatórios). Você precisa confirmar se a `ADMIN_SERVICE_ROLE_KEY` já cadastrada é do `yqvocpnvunaprpmhlswn`; se não, me passa a nova.

4. **Melhoria de UX (opcional, incluída)** — trocar o texto do banner em `_authenticated/route.tsx` de "Backend não conectado" para "Sessão expirada — faça login" com CTA para `/auth`, já que o gate real do backend é o login.

5. **Reiniciar preview** após alterar `.env` para o Vite recarregar as variáveis.

## O que preciso de você antes de implementar

- **VITE_SUPABASE_PUBLISHABLE_KEY** do projeto `yqvocpnvunaprpmhlswn` (formato `sb_publishable_...` ou anon JWT `eyJ...`). Sem ela o cliente não autentica.
- Confirmação de que `ADMIN_SERVICE_ROLE_KEY` já configurada como secret é do mesmo projeto; se não, me envie via campo seguro.

## Fora de escopo

- Não vou tocar em `src/integrations/supabase/client.ts` nem em `types.ts` (auto-gerados).
- Não vou rodar migrations — o SQL do OCR já está em `docs/migrations/leitor-lista-presenca.sql` para você rodar no SQL Editor do `yqvocpnvunaprpmhlswn`.
