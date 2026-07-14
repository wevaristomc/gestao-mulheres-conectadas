## Ordenação de colunas na frequência

Adicionar ordenação interativa (clique no cabeçalho) nas três telas de frequência, mantendo tudo em UI/estado local — sem tocar em queries ou backend.

### Telas e critérios

**1. Fiscalização MTE › Presenças** (`src/routes/_authenticated/mte.presencas.tsx`)
Cabeçalhos clicáveis com indicador de direção (↑/↓):
- Beneficiária → alfabética A→Z / Z→A
- Freq. atual → % maior→menor / menor→maior (nulos ao final)
- Presença → P primeiro / F primeiro (usando estado `local`)
- Justificativa → preenchidas primeiro / vazias primeiro

**2. Pedagógico › Turma › Frequência** (`src/routes/_authenticated/pedagogico.turmas.$id.frequencia.tsx`)
Ordena a lista de cursistas (linhas da matriz e lista mobile):
- Cursista → alfabética A→Z / Z→A
- % frequência total (calculada a partir do `freqIndex` sobre todas as aulas) → maior→menor / menor→maior

Adicionar um pequeno seletor acima da tabela (desktop e mobile) já que a matriz tem N colunas de aulas e não faz sentido tornar cada data ordenável. Opções: "Nome (A→Z)", "Nome (Z→A)", "Frequência (maior)", "Frequência (menor)".

**3. Relatórios › Frequência** (`src/routes/_authenticated/relatorios.frequencia.tsx`)
Cabeçalhos clicáveis conforme colunas existentes na tabela. Critérios:
- Nome/beneficiária → alfabética
- % frequência → numérica
- Presença/status agregado → presentes primeiro / faltosos primeiro
- Justificativa (se existir coluna) → com motivo / sem motivo

Ler o arquivo antes de editar para mapear as colunas reais e aplicar somente aos campos existentes.

### Detalhes técnicos

- Estado local por página: `const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>()`.
- Clique no `TableHead` alterna direção; segundo critério diferente reseta para `asc`.
- Ordenação via `useMemo` sobre a lista já filtrada — não altera queries nem invalidações.
- Componente auxiliar local `SortableHeader` (ícone `ArrowUp`/`ArrowDown`/`ArrowUpDown` de lucide-react) para não repetir markup.
- Comparação de strings com `localeCompare(pt-BR, { sensitivity: "base" })`; números com fallback para nulos ao final independente da direção.
- Nada muda em `mte-queries.ts`, `pedagogico-queries.ts`, `relatorios-queries.ts` nem no banco.

### Fora do escopo

- Persistência da ordenação entre sessões.
- Ordenação server-side / paginação.
- Reordenar colunas de aulas na matriz pedagógica.