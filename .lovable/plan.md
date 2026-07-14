## Diagnóstico

O painel `?debug=1` mostrou que a coluna 09/06 agora aponta para uma **aula nova** (id `fe1088bb…`, 18:00–22:00, 0 P / 0 F / 46 sem marca).

O banco, porém, ainda tem as duas aulas antigas do mesmo dia com as marcações que você fez manualmente:

- `a18324252` — 08:00 (manhã) com várias `presente = true`
- `a18324251` — 21:00 (noite) com `presente = false` marcados

Ou seja: **as presenças não sumiram** — elas ainda estão em `presencas`, mas apontando para as aulas antigas. A grade agora só está renderizando a nova aula `fe1088bb…` (18:00–22:00), então parece "tudo vazio".

Preciso descobrir de onde saiu essa aula `fe1088bb` (a turma tem grade padrão 18:00–22:00 configurada, então provavelmente algum caminho de auto-criação — abertura da tela, botão "gerar aulas" ou similar — inseriu uma terceira aula em 09/06 usando o horário padrão da turma, ignorando as duas que já existiam).

## Plano

### 1. Investigação (read-only) antes de qualquer escrita
- Listar **todas** as aulas dessa turma em 09/06/2026 (esperado: 3 — `a18324252` 08:00, `a18324251` 21:00, `fe1088bb…` 18:00) e conferir `criado_em` de cada uma para identificar qual é a nova.
- Grep no código pelos pontos que fazem `insert` em `aulas` (fora do `leitor-lista.ts`): geração automática por calendário da turma, botão "Gerar aulas", `upsertAula`, hooks do `frequencia` etc. Identificar o caminho que criou `fe1088bb`.

### 2. Recuperação dos dados de 09/06 (uma migration única)
- **Consolidar em uma aula só** para o dia 09/06 nessa turma:
  - Manter `a18324252` (08:00) como aula canônica do dia (é a que tem `presente=true` reais).
  - Mover as `presencas` de `a18324251` (noite) para `a18324252`, resolvendo conflito por `matricula_id` com regra `presente = true` vence `presente = false` (não perde nenhuma marcação).
  - Deletar `a18324251` e `fe1088bb…` depois do merge.
  - Ajustar `hora_inicio`/`hora_fim` de `a18324252` para o intervalo real do dia (18:00–22:00, que é o horário padrão da turma) para bater com MTE.
- Se a investigação mostrar que a "manhã" 08:00 não corresponde à realidade (era só um erro de import antigo), inverto: mantenho a da noite e movo as poucas presenças válidas para ela — decido depois de olhar `criado_em` e `presente` das duas.

### 3. Impedir que volte a acontecer
- No caminho que criou a `fe1088bb` (auto-geração pelo horário padrão da turma), aplicar a mesma regra do `upsertAula`: antes de inserir, procurar aula existente em `turma_id + data`; se já existir **qualquer** aula no dia, **não** criar outra — reaproveitar a existente (ajustando `hora_inicio`/`hora_fim` só se estiver vazio).
- Manter o log/erro claro quando houver mais de uma aula no mesmo dia, para o painel `?debug=1` sinalizar.

### 4. Validação
- Após a migration: recarregar a aba Frequência da BET-MC-02 → coluna 09/06 volta a mostrar as marcações originais (P/F que você fez manualmente).
- Conferir que MTE → Fiscalização mostra os mesmos números P/F/sem-marca no mesmo dia.
- Conferir que Relatórios/Apuração para junho/2026 dessa turma não mudou para os outros dias.
- Rodar `?debug=1` de novo e confirmar: 1 linha em 09/06, contadores batendo.

## Detalhes técnicos

- Migration usará `UPDATE presencas SET aula_id = <canonica> WHERE aula_id IN (…)` com `ON CONFLICT (aula_id, matricula_id) DO UPDATE SET presente = presencas.presente OR EXCLUDED.presente` (ou equivalente via CTE, já que não há necessariamente unique constraint — nesse caso `DELETE` dos duplicados antes do `UPDATE`, preservando `presente=true`).
- `DELETE FROM aulas WHERE id IN ('a18324251','fe1088bb…')` só depois do merge.
- Fix no código de auto-geração: mesma assinatura de `upsertAula` (buscar por `turma_id + data` primeiro, sem inserir se já existir).

Nada é escrito antes de você aprovar; a migration mostra o SQL exato antes de rodar.
