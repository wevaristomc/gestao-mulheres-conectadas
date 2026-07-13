## Problema

Ao salvar a chamada em **Fiscalização MTE → Presenças**, os dados são gravados corretamente na tabela `presencas`, mas a aba **Relatórios → Frequência** (e o painel de frequência do Pedagógico) continuam mostrando os números antigos até a página ser recarregada manualmente. As tabelas já se cruzam no banco — o que falta é a invalidação de cache do React Query entre módulos.

Confirmado em `src/routes/_authenticated/mte.presencas.tsx` (linhas 91–95): após `upsertPresencaMTE`, só são invalidadas as chaves `["mte","presencas"]` e `["mte","matriculas"]`. As chaves usadas pelos relatórios (`["relatorios","frequencia", projetoId]`) e pelo pedagógico (`["pedagogico","frequencia", turmaId]`) ficam com dado stale por 30s ou mais.

O mesmo desalinhamento existe no sentido inverso: ao salvar em **Pedagógico → Frequência** (`pedagogico.turmas.$id.frequencia.tsx`) só invalida `["pedagogico","frequencia", turmaId]` — a aba MTE Presenças e o relatório de frequência não reagem.

## Correção

1. **`src/routes/_authenticated/mte.presencas.tsx`** — no `onSuccess` de `save`, adicionar invalidação de:
   - `["relatorios","frequencia"]`
   - `["pedagogico","frequencia"]`
   - `["relatorios"]` genérico (indicadores/metas que consomem frequência)

2. **`src/routes/_authenticated/pedagogico.turmas.$id.frequencia.tsx`** — no `onSuccess` da mutation, adicionar as mesmas invalidações + `["mte","presencas"]` e `["mte","matriculas"]`.

3. **`src/lib/leitor-lista.ts`** (`confirmarImportacao`) — este caminho grava presenças em lote via importação de lista escaneada. Não estou alterando a assinatura, mas vou adicionar uma nota nos chamadores (`mte.importar-lista.tsx`) para invalidar as mesmas chaves após sucesso.

4. Padronizar num pequeno helper interno em cada rota (`invalidateFrequenciaCrossCutting(qc)`) para não repetir a lista de chaves.

## Fora de escopo

Não vou alterar RLS, esquema, nem a lógica de leitura dos relatórios — o cruzamento já funciona no banco, o que falta é a sincronização de UI.
