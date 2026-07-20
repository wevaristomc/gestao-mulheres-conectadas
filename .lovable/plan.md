## Diagnóstico

Verifiquei direto no banco: a tabela `landing_depoimentos` **não existe** e o bucket de storage `landing` **também não existe**. Ou seja, a migração `docs/migrations/landing-depoimentos.sql` (que cria tabela, políticas RLS, bucket e políticas de storage) nunca foi executada neste projeto.

Por isso, na aba Administrativo → Depoimentos:
- **Adicionar depoimento** falha: o upload do MP4 vai para um bucket inexistente e a inserção também.
- **Editar / alternar visibilidade / reordenar / excluir** falham: todas as chamadas caem em erro de tabela inexistente ("A migração de depoimentos da landing ainda não foi aplicada.").
- Os cards que aparecem na tela são apenas o fallback estático da landing renderizado por outro caminho — mas nenhuma ação persiste.

## O que fazer

Aplicar a migração já pronta em `docs/migrations/landing-depoimentos.sql`, sem alterações de código. Ela é idempotente e cria:

- Tabela `public.landing_depoimentos` (nome, contexto, video_path, ordem, ativo) + trigger de `atualizado_em`.
- Políticas RLS de SELECT/INSERT/UPDATE/DELETE restritas a `coordenador_geral`, `coordenador_pedagogico` e `administrativo`.
- GRANTs corretos para `authenticated` (e REVOKE em `anon`).
- Bucket público `landing` (MP4, até 50 MB) com políticas de storage: leitura pública, escrita/atualização/exclusão só para os mesmos papéis.
- Seed dos 5 depoimentos iniciais (Andressa, Camila, Deisiane, Elisangela, Ivete) apontando para os arquivos estáticos, para não perder o que aparece hoje.

## Passos

1. Rodar `docs/migrations/landing-depoimentos.sql` pela ferramenta de migração (aprovação do usuário).
2. Recarregar a página Administrativo → Depoimentos e confirmar que:
   - O switch "Visível na landing" persiste após reload.
   - "Adicionar depoimento" faz upload do MP4 no bucket `landing` e cria o registro.
   - Editar / reordenar / excluir funcionam sem erro.

Nenhuma alteração em arquivos de código é necessária — o front e as server functions já estão prontos e passam a operar assim que a migração roda.
