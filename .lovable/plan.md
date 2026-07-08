## Problema

Ao importar o dump do Moodle, o servidor responde "Apenas administradores podem importar dump do Moodle." mesmo para usuários que são coordenação geral.

**Causa:** `src/lib/moodle-import.functions.ts` chama `context.supabase.rpc("has_role", { _user_id, _role: "admin" })`. Esse RPC não existe neste projeto e o papel "admin" também não é usado — o sistema usa a role `coordenador_geral` diretamente na tabela `user_roles` (ver `src/lib/rbac.functions.ts::assertCoordenadorGeral`). Como o RPC retorna erro, o check cai no `else` e bloqueia todos os usuários.

## Correção

Substituir o check em `src/lib/moodle-import.functions.ts` pelo mesmo padrão já usado no resto do app: consultar `user_roles` via `context.supabase` e exigir `role = 'coordenador_geral'` para o usuário logado. Sem `projeto_id` no formulário, aceita-se qualquer vínculo `coordenador_geral` do usuário (padrão de ações globais como a importação do AVA).

```ts
const { data: vinc, error: roleErr } = await context.supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", context.userId)
  .eq("role", "coordenador_geral")
  .limit(1)
  .maybeSingle();
if (roleErr) throw new Error(roleErr.message);
if (!vinc) throw new Error("Apenas a coordenação geral pode importar dump do Moodle.");
```

Nenhuma outra mudança: parse, upserts e cruzamentos permanecem iguais. Mensagem de erro passa a refletir corretamente o papel exigido.

## Arquivos alterados

- `src/lib/moodle-import.functions.ts` — troca do `rpc("has_role", …)` pela consulta direta em `user_roles`.
