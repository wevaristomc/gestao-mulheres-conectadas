## Problemas identificados

**1. Datas exibidas um dia antes do valor real**

`formatarData()` em `src/lib/pedagogico-queries.ts` (e cópias em `captacao-queries.ts`, `financeiro-queries.ts`, `base-conhecimento-queries.ts`) faz `new Date("2026-05-09")`, que o navegador interpreta como **meia-noite UTC**. No fuso do Brasil (UTC-3) isso vira 21h do dia anterior → exibe 08/05 quando o banco tem 09/05. Mesmo comportamento para o Fim.

**2. Editar turma abre "criar nova"**

Em `/pedagogico` (`src/routes/_authenticated/pedagogico.index.tsx`) o botão de editar abre `TurmaDialog` (`src/components/turma-dialog.tsx`), que só tem 5 campos (`nome`, `turno`, `data_inicio`, `data_fim`, `descricao`) e lê o nome via `pickFirst(turma, ["nome", "titulo"])`. As turmas cadastradas pelo Cronograma MTE não têm `nome` — têm `codigo_turma` + `nome_curso`, além de dezenas de outros campos (ciclo, endereço, CH, contato, etc.). Resultado: o diálogo abre com quase tudo em branco e parece um "cadastro novo". Salvar por ali sobrescreve o registro com um `nome` genérico e apaga o restante do contexto ao usuário.

Já existe o diálogo completo `TurmaFormDialog` em `src/components/mte/turma-form-dialog.tsx` — é o mesmo usado no Cronograma para criar/editar turmas MTE.

## Correções

### A. Corrigir formatação de datas (`YYYY-MM-DD` sem UTC)

Em `src/lib/pedagogico-queries.ts` reescrever `formatarData()` para tratar strings `YYYY-MM-DD` (com ou sem hora) construindo a data em horário local:

```ts
export function formatarData(v: string | null | undefined): string {
  if (!v) return "—";
  const s = String(v).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
```

Aplicar a mesma correção nas cópias em `src/lib/captacao-queries.ts`, `src/lib/financeiro-queries.ts` e `src/lib/base-conhecimento-queries.ts` para manter comportamento consistente entre Pedagógico, Administrativo, Relatórios, Captação, Financeiro e Base de Conhecimento.

### B. Editar turma abre o diálogo correto no Pedagógico

Em `src/routes/_authenticated/pedagogico.index.tsx`:

1. Importar `TurmaFormDialog` além do atual `TurmaDialog`.
2. Detectar se a linha é uma turma MTE (tem `codigo_turma` ou `nome_curso`). Se sim, abrir `TurmaFormDialog` passando `turma={r}` (o componente já carrega todos os campos via `{...empty, ...turma}`). Caso contrário, abrir o `TurmaDialog` simples atual.
3. Estado passa a distinguir os dois modos:
   ```ts
   const [editing, setEditing] = useState<Row | null>(null);
   const [dialogMode, setDialogMode] = useState<"simples" | "mte">("simples");
   ```
   No clique de "Editar": `setDialogMode(r.codigo_turma || r.nome_curso ? "mte" : "simples")`.
4. Após salvar, invalidar `["mte","turmas"]` e `["pedagogico","turmas"]` (o `TurmaFormDialog` já faz isso).

## Escopo

- **Fora do escopo**: alterar schema, mudar `TurmaDialog` para virar o formulário completo, ou alterar o cadastro de turmas MTE em `/mte/cronograma`.
- Nenhuma migração de banco é necessária.

## Arquivos afetados

- `src/lib/pedagogico-queries.ts` (fix `formatarData`)
- `src/lib/captacao-queries.ts` (fix `formatarData`)
- `src/lib/financeiro-queries.ts` (fix `formatarData`)
- `src/lib/base-conhecimento-queries.ts` (fix `formatarData`)
- `src/routes/_authenticated/pedagogico.index.tsx` (roteamento entre `TurmaDialog` e `TurmaFormDialog` no editar)