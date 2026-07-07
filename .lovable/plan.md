## Problema

O `.env` gerenciado pelo Lovable Cloud aponta `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` para o projeto **`ahgcdtnpdfkcrjkxclhb`** (projeto gerenciado, vazio). Os usuários, roles e RPCs reais estão em **`yqvocpnvunaprpmhlswn`**. Como o cliente browser lê `import.meta.env.VITE_SUPABASE_*`, todas as chamadas de auth vão para o projeto errado — login falha com "invalid_credentials", `tem_admin` retorna 404, e a recuperação de senha retorna 200 mas não envia email.

Editar `.env` não resolve permanentemente: o Cloud reescreve o arquivo a cada build.

## Solução

Hardcodar o projeto correto direto em `src/integrations/supabase/client.ts`, ignorando `import.meta.env` para URL e chave publicável. O arquivo hoje usa env com fallback; vou inverter para usar valores fixos do projeto real, deixando os env vars apenas como referência.

### Alteração em `src/integrations/supabase/client.ts`

```ts
const SUPABASE_URL = "https://yqvocpnvunaprpmhlswn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxdm9jcG52dW5hcHJwbWhsc3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDk4MDIsImV4cCI6MjA5ODIyNTgwMn0.L8FQRfI2M7RAGdTPsyNvHWXEWqmywtfHKP-65eyljwE";
```

A chave é o JWT anônimo público (role `anon`) — sem risco de vazamento; é a mesma classe de segredo que qualquer app Supabase expõe no bundle client.

`auth-middleware.ts` e `client.server.ts` já estão hardcoded no projeto correto (fix anterior), então servidor e client passam a bater no mesmo backend.

## Verificação

1. Após o build, abrir preview em janela limpa (limpar localStorage para descartar tokens antigos do projeto errado).
2. Confirmar em DevTools → Network que requests de `/auth/v1/token` vão para `yqvocpnvunaprpmhlswn.supabase.co`.
3. Login do ADM funciona.
4. Recuperação de senha efetivamente dispara email.
