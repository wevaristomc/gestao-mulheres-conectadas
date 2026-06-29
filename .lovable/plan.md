## Contexto

A tela `/auth` ainda mostra o aviso amarelo "Autenticação aguardando a conexão da integração Supabase. Por enquanto, este formulário é apenas visual." e o botão **Entrar** está `disabled`. O Supabase externo já está conectado (counts de `projetos`, `turmas`, `cursistas`, `pendencias` retornam OK), então esse aviso e o estado desabilitado estão obsoletos.

Além disso:
- `src/routes/_authenticated/route.tsx` renderiza um banner `BackendNotice` ("Backend não conectado…") apoiado em `isBackendConnected: false` fixo no provider.
- `src/hooks/use-active-context.tsx` ainda devolve `user: null`, `role: null` e `isBackendConnected: false` por padrão (stub).
- `src/lib/auth-guard.ts` checa o token diretamente em `localStorage`, mas nunca há sessão porque o login não submete nada.

## O que entregar

### 1. Tela `/auth` funcional (`src/routes/auth.tsx`)
- Remover o bloco de aviso amarelo `<AlertTriangle …>` e seu import.
- Tornar o formulário controlado (state para `email`, `senha`, `loading`, `errorMsg`).
- `onSubmit`: `supabase.auth.signInWithPassword({ email, password })`.
  - Erro → mostrar mensagem PT-BR ("E-mail ou senha inválidos." para `Invalid login credentials`; demais erros mostram `error.message`).
  - Sucesso → `navigate({ to: "/", replace: true })` (TanStack Router).
- Habilitar o botão **Entrar** (mostrar spinner / "Entrando…" enquanto `loading`).
- Manter "Esqueci minha senha" desabilitado por ora (fora do escopo desta tarefa).
- Se já houver sessão ao montar (`supabase.auth.getSession()`), redirecionar direto para `/`.

### 2. Sessão real no guard (`src/lib/auth-guard.ts`)
- Manter a função `hasClientSession()` — ela já detecta a chave `sb-<ref>-auth-token` que o `supabase-js` grava após login bem-sucedido. Nenhuma mudança necessária; só precisa de uma sessão real existindo.

### 3. `ActiveContextProvider` lendo Supabase (`src/hooks/use-active-context.tsx`)
Substituir o stub por:
- `useEffect` com `supabase.auth.getSession()` + `supabase.auth.onAuthStateChange` para popular `user`.
- Após ter `user.id`, ler em paralelo:
  - `projetos` (id, nome) — `select('id, nome').order('nome')`.
  - `user_roles` do usuário corrente — `select('role, projeto_id').eq('user_id', user.id)`.
- `projetoId` inicial: primeiro projeto retornado (ou `localStorage` se já houver um salvo). `setProjetoAtivo` persiste em `localStorage` (`mc.active_projeto`).
- `role`: papel do usuário no `projetoId` ativo (linha de `user_roles` cujo `projeto_id` bate; fallback para linha com `projeto_id IS NULL` se a tabela permitir papel global).
- `setCachedRole(role)` (de `auth-guard.ts`) sempre que `role` mudar, para o `requireModuleAccess` continuar funcionando em navegações diretas.
- `isBackendConnected: true` sempre que existir sessão (deixa o `BackendNotice` sumir naturalmente).
- Em `SIGNED_OUT`: limpar `user`, `role`, `projetoId` e `setCachedRole(null)`.

### 4. `BackendNotice` em `_authenticated/route.tsx`
- Mantido como está (já oculta sozinho quando `isBackendConnected` virar `true`). Sem mudanças.

### 5. Sign-out
- Adicionar handler de logout em `AppTopbar` (botão já existe ou adicionar item no menu do usuário): `supabase.auth.signOut()` → `navigate({ to: "/auth", replace: true })`. Confirmar olhando `app-topbar.tsx` antes de editar; se já houver, só plugar.

## Detalhes técnicos

- Usar `import { supabase } from "@/integrations/supabase/client"` (cliente browser já configurado).
- TanStack Router: `const navigate = useNavigate(); navigate({ to: "/", replace: true })`.
- Não introduzir server functions nesta etapa — todas as leituras são RLS-safe via cliente browser (sessão autenticada).
- Não tocar em `src/integrations/supabase/auth-middleware.ts` nem em rotas server.
- Não criar novas tabelas; usar `user_roles` e `projetos` já existentes.

## Fora de escopo (não fazer agora)

- Reset de senha por e-mail.
- Tela de signup (criação de conta é manual pelo admin no Supabase).
- Sincronizar role/projeto entre abas além do que `onAuthStateChange` já cobre.
- Implementar os módulos (Visão Geral KPIs, Pendências, Pedagógico, etc.) — continuam placeholders.

## Como validar

1. Carregar `/auth` → não há mais banner amarelo; campos e botão habilitados.
2. Submeter credenciais inválidas → mensagem em PT-BR aparece.
3. Submeter credenciais válidas → redireciona para `/` e o banner "Backend não conectado" some.
4. Recarregar a página autenticado → permanece em `/`, sidebar mostra papel correto.
5. Logout → volta para `/auth` e o guard impede acesso a rotas protegidas.
