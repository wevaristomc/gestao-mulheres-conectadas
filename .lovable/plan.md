## Objetivo
Em Configurações → Instrutores ↔ Turmas, exibir as turmas pelo **nome** (nomenclatura), deixando o código como informação secundária (ou omitido quando o nome existir).

## Alteração
Arquivo: `src/routes/_authenticated/configuracoes.instrutor-turmas.tsx`

Trocar a fórmula atual de rótulo da turma, usada em dois lugares (SelectItem e célula da tabela):

Antes:
```
{t.codigo ? `[${t.codigo}] ` : ""}{t.nome ?? t.id}
```

Depois — nome em primeiro plano, código só como sufixo discreto e apenas se o nome existir:
- Se `t.nome` existir: mostrar `t.nome` e, se houver `t.codigo`, um sufixo `· <codigo>` em `text-muted-foreground text-xs`.
- Se `t.nome` for nulo: cair para `t.codigo` e, em último caso, `t.id.slice(0,8)`.

Extrair um helper local `formatTurmaLabel(t)` (retorna JSX para o Select/Tabela) para manter DRY.

## Fora de escopo
- Não altera a query, o schema, nem outras telas.
- Sem mudanças de layout mobile/desktop já feitas.
- Sem mudança em geradores de PDF.

## Verificação
Typecheck limpo; visualmente, o Select e a tabela passam a mostrar “Turma de Costura Básica · T-01” em vez de “[T-01] Turma de Costura Básica”.