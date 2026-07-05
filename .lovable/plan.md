## Diagnóstico

A role no banco está correta (`coordenador_geral` com `projeto_id = d91d…302`), então o problema está no cliente. Duas causas prováveis, precisamos confirmar qual:

**Hipótese A — RLS bloqueia `select` em `user_roles`.** O hook faz `supabase.from("user_roles").select(...).eq("user_id", user.id)`. Se não existe policy `SELECT` permitindo o usuário ler as próprias rows, `rolesRes.data` volta vazio → `pickRole` retorna `null` → `canAccess` retorna `false` para tudo → sidebar quase vazio.

**Hipótese B — Race de renderização.** Sidebar renderiza antes das rows chegarem: com `role=null` o filtro `canAccess` esconde os itens; quando a role chega, o React re-renderiza, mas se algum consumidor (ex.: cache de role, `requireModuleAccess`) leu antes, o estado "capado" persiste.

## Passos

1. **Instrumentar o `use-active-context`** com logs temporários do resultado bruto de `projetos` e `user_roles` (contagem, primeiro row, erro). Isso mostra na console se é RLS (data vazio + erro) ou timing.

2. **Adicionar estado de loading** em `useActiveContext` (`isLoadingRoles`) e expor via contexto. O `AppSidebar` renderiza skeletons enquanto `isLoadingRoles` for `true`, evitando o flash com role `null`.

3. **Se for Hipótese A**, adicionar migration com policy de leitura própria em `user_roles`:

   ```sql
   create policy "Users can read own roles"
     on public.user_roles for select
     to authenticated
     using (auth.uid() = user_id);
   ```

   (mantendo `has_role` como security-definer para checagens cruzadas).

4. **Endurecer `pickRole`**: quando houver múltiplas rows, priorizar a role de maior privilégio (ordem: `coordenador_geral` > `gestor_financeiro` > `coordenador_pedagogico` > `administrativo` > `professor` > `auxiliar_pedagogico`) em vez de depender só do `projeto_id` casado. Isso evita que uma row secundária mascare a role global.

5. **Validar no preview**: logar na console após login com Rita — esperado `role: coordenador_geral`, sidebar com todos os grupos (Geral, Módulos completo, Apoio com Configurações visível).

6. **Remover logs** após confirmação e manter apenas `isLoadingRoles` + policy + `pickRole` reforçado.

## Detalhes técnicos

- Arquivos: `src/hooks/use-active-context.tsx` (loading state, pickRole, logs), `src/components/app-sidebar.tsx` (skeleton), nova migration se hipótese A.
- Não altera `role-access.ts` nem rotas.
- `requireModuleAccess` continua lendo `mc.active_role` do `localStorage`; após o fix, o cache é atualizado assim que a role real chega.