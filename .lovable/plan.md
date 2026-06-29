
# Conectar Supabase externo (mulheres-conectadas)

Esta ação só pode ser feita por você na interface do Lovable. Não tenho ferramenta que crie a integração externa nem injete as variáveis `VITE_SUPABASE_*`.

## Passo a passo

1. **Localize o botão Supabase**
   - No topo direito desta tela do Lovable, ao lado dos botões **GitHub** e **Publish**, há um botão com o logo verde do **Supabase**.
   - Se não aparecer, abra o menu (avatar/⋯) → **Integrations** → **Supabase**.

2. **Escolha "Connect existing project"**
   - Vai abrir um modal com duas opções: *Create new* (cria um banco novo, vazio — **não use**) e *Connect existing* (liga ao seu projeto já existente).
   - Selecione **Connect existing project**.

3. **Autorize o Lovable no Supabase**
   - Se for a primeira vez, abre uma janela do Supabase pedindo permissão para o Lovable listar seus projetos. Faça login com a conta dona do projeto `mulheres-conectadas` e clique **Authorize**.

4. **Selecione o projeto**
   - Na lista, escolha **mulheres-conectadas** (id `yqvocpnvunaprpmhlswn`, região correspondente).
   - Confirme. O Lovable busca sozinho a URL e a publishable key — você não precisa colar nada.

5. **Aguarde a sincronização (10–30s)**
   - O botão Supabase deve passar a mostrar um indicador verde / nome do projeto.
   - No editor de arquivos, aparecerão automaticamente:
     - `src/integrations/supabase/client.ts`
     - `src/integrations/supabase/types.ts`
     - `src/integrations/supabase/auth-middleware.ts`
   - As variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` ficam disponíveis no runtime (não precisam ser editadas à mão).

6. **Me avise nesta conversa**
   - Basta escrever "conectado" (ou colar print do botão verde).

## O que farei no turno seguinte

- Rodar `count(*)` em `projetos`, `turmas`, `cursistas`, `pendencias`, `matriculas`, `orcamento_itens` para confirmar leitura real.
- Substituir o stub do `useActiveContext` por sessão Supabase real + `get_user_role()` + seletor de projeto no topbar.
- Plugar o sino de notificações no `count` real de `pendencias` com `status='aberta'`.
- Retomar a fila acumulada de PROMPTs (1 Visão Geral/Pendências → 7 LGPD).

## Se algo der errado

- **Não vejo o botão Supabase**: verifique se você é admin do workspace Lovable. Em workspaces compartilhados, só admins ligam integrações.
- **"Project not found" na lista**: você logou no Supabase com outra conta. Saia (`supabase.com` → avatar → Sign out) e refaça o passo 3 com a conta dona do projeto.
- **Conectou mas os arquivos não aparecem**: aguarde 1 min e recarregue (F5) o editor do Lovable. Persistindo, desconecte (botão Supabase → Disconnect) e refaça.
- **Aparece "Create new" forçado**: significa que o Lovable não enxergou nenhum projeto na sua conta — confirme no Supabase Dashboard que o projeto `yqvocpnvunaprpmhlswn` existe e está ativo (não pausado por inatividade).

Aprove este plano para eu ficar pronto para executar a verificação assim que você concluir os passos acima.
