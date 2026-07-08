
## Diagnóstico

Analisando as chamadas de rede da sua sessão e o resultado do botão "Gerar matrículas do AVA" (que retornou `criadas: 0 · atualizadas: 0 · ignoradas: 0 · total_pares: 0`), a importação **rodou**, mas quase nada foi promovido às tabelas operacionais por **três motivos distintos**:

### 1. A tabela `beneficiarias` está vazia
A consulta `GET /rest/v1/beneficiarias` retornou `[]`. Sem beneficiárias, o cruzamento por CPF (`ava_users.beneficiaria_id`) não tem para onde apontar → nenhuma matrícula pode ser gerada, porque `matriculas` exige `beneficiaria_id` real.

**Causa:** o import do dump do Moodle nunca cria beneficiária — ele apenas **cruza** com beneficiárias que já existem. Como o cadastro está vazio, o cruzamento inteiro falhou silenciosamente.

### 2. 7 de 8 cursos do AVA não bateram com nenhuma turma
Do retorno `GET /rest/v1/ava_courses`:

| `shortname` no Moodle | `codigo_turma` no sistema | Cruzou? |
|---|---|---|
| `JBT-MC-01` | `JBT-MC-01` | ✅ |
| `Turma: BET-MC-01` | (não existe) | ❌ |
| `Turma: BET-MC-02` | (não existe) | ❌ |
| `Turma: BET-MC-03` | (não existe) | ❌ |
| `Turma: JBT-MC-01` | `JBT-MC-01` | ❌ (prefixo "Turma: ") |
| `Turma: JBT-MC-02` | (não existe) | ❌ |
| `AVA PARA PROFESSORES` / `TREINAMENTO AVA` / `JBT-MC-03` | (não existem) | ❌ |

Dois problemas se somam:
- O algoritmo de match usa `shortname` igual/contido em `codigo_turma`, mas o Moodle grava `"Turma: BET-MC-01"` com prefixo. A lógica atual só limpa case/espaço, não remove o prefixo `Turma:`.
- Só existe **uma turma cadastrada** no sistema (`JBT-MC-01`). As demais (`BET-MC-01/02/03`, `JBT-MC-02/03`) precisam ser criadas manualmente antes que o cruzamento funcione.

### 3. `ava_enrolments` do curso cruzado está vazio
`GET /rest/v1/ava_enrolments?ava_course_id=eq.5` retornou `[]`. Ou seja, mesmo para a única turma cruzada, nenhum aluno foi importado como matrícula do AVA. Isso acontece porque o parser do dump depende de `pmc_enrol` (instância de matrícula) → `pmc_user_enrolments` (aluno × instância). Se o dump não contém INSERTs em `pmc_enrol` para o curso 5, ou os IDs não bateram, as matrículas ficam sem `ava_course_id` e são filtradas.

### 4. Professores/instrutores
O import do dump **não trata professores** hoje. `pmc_role_assignments` (que liga usuário → curso → papel `editingteacher`) não está entre as tabelas parseadas. Por isso instrutor de turma nunca é preenchido a partir do AVA.

---

## Plano de correção (proposto)

### Passo A — Diagnóstico rápido (para você confirmar antes)
Rodar no SQL Editor do banco:
```sql
select count(*) from ava_users;
select count(*) from ava_users where cpf is not null;
select count(*) from ava_enrolments;
select count(*) from ava_enrolments where ava_course_id is not null;
```
Isso confirma se `pmc_enrol` foi de fato ignorado no parse ou se o dump não trouxe essa tabela.

### Passo B — Ajustes no import do dump
1. **Normalizar `shortname` no match de turmas.** Remover prefixo `"Turma:"`/`"turma "` e comparar a chave já limpa. Isso resolve 4 dos 5 cursos não cruzados imediatamente.
2. **Parse de `pmc_role_assignments` + `pmc_context`.** Popular `ava_users.role_por_curso` (nova coluna JSONB) para saber quem é `editingteacher`/`teacher` em cada curso. Servirá para o passo D.
3. **Retornar contadores mais claros** no card do dump: "cursos sem turma equivalente", "alunos sem beneficiária", "enrolments sem curso mapeado" — hoje esses casos somem no resumo.

### Passo C — Criar beneficiárias a partir do AVA (opt-in, com revisão)
Nova tela `mte/importar-lista` → card "Beneficiárias sugeridas pelo AVA":
- Lista `ava_users` com CPF válido e `beneficiaria_id NULL`.
- Cada linha marcável; botão "Criar N beneficiárias selecionadas".
- Cria com `nome = firstname + lastname`, `cpf`, `email` — marca `observacoes = 'Cadastro incompleto — origem AVA'` para você completar depois.
- Após criar, roda o cruzamento novamente e o botão "Gerar matrículas" passa a produzir resultado.

### Passo D — Vincular professor da turma (a partir do AVA)
Depois que o Passo B.2 estiver rodando, novo botão "Sugerir instrutores do AVA":
- Para cada `ava_course` com `turma_id` e algum aluno com papel `editingteacher`, propor esse usuário como `turmas.instrutor_id` (via tabela `usuarios`/`profiles` por email/CPF).
- Não grava automático — mostra tabela "AVA sugere X para turma Y" e você confirma.

### Passo E — Recomendação sobre turmas ausentes
Não criar turmas automaticamente: os campos MTE obrigatórios (`horario_realizacao`, `local_endereco`, `contato_local_nome`, `municipio`, `ciclo`, `turno`, CH, vagas) não vêm do Moodle. Em vez disso, o card do dump lista **"Cursos do AVA sem turma correspondente"** com um botão "Criar turma pré-preenchida" que abre o form MTE já com `codigo_turma` e `nome_curso` populados — você completa o resto.

---

## Escopo desta próxima entrega

Sugestão de priorização (do maior impacto ao menor):

1. **Passo B.1** (normalizar prefixo `Turma:`) — trivial, resolve 4 cruzamentos.
2. **Passo A** — você roda o SQL e me diz os contadores, para eu saber se `ava_enrolments` está mesmo vazio ou se é problema de parse do `pmc_enrol`.
3. **Passo C** — cadastro em lote de beneficiárias sugeridas (com revisão), que é o **bloqueio principal** hoje.
4. **Passo B.2 + D** — professores via `pmc_role_assignments`.
5. **Passo E** — atalho "criar turma pré-preenchida".

### Perguntas antes de eu implementar

1. Fecho o escopo **em B.1 + C + E** nesta rodada (o que desbloqueia matrículas de verdade) e deixo B.2/D (professores) para a rodada seguinte, ou você prefere que eu inclua professores já agora?
2. No passo A, você consegue rodar aqueles 4 `select count(*)` e me mandar os números? Se `ava_enrolments` estiver vazio, precisamos ajustar o parser do dump antes de qualquer outra coisa.
