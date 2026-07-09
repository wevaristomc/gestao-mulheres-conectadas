## Diagnóstico

Vasculhei o import do dump Moodle (`src/lib/moodle-import.functions.ts` + `moodle-import.server.ts`) e o modelo de dados do app. Achei dois motivos claros para os e-mails "sumirem":

### 1) Alunas com e-mail vazio
O dump gera duas coisas separadas:
- `ava_users` — espelho fiel do Moodle, **com e-mail preenchido** (a coluna `email` é lida do `pmc_user`).
- `beneficiarias` — cadastro do projeto, com o próprio campo `email`.

O cruzamento pós-import (`beneficiarias ← ava_users` por CPF) só faz:
```ts
admin.from("ava_users").update({ beneficiaria_id: bid }).eq("moodle_id", u.moodle_id)
```
Ou seja: liga a AVA à beneficiária existente, **mas nunca copia o e-mail (nem telefone) do AVA para a beneficiária**. Só quando a beneficiária é CRIADA a partir do fluxo "Sugestões AVA" (`gerarBeneficiariasAvaFromMoodle`) o e-mail é copiado no INSERT. Toda beneficiária que veio antes por CSV / cadastro manual / lista de presença fica com `email = null` mesmo depois do vínculo com o AVA.

### 2) Professores sem e-mail
Professores no app **não vêm do dump Moodle**. Eles são registros da tabela `usuarios` com `role in ('professor','auxiliar_pedagogico')`, criados na aba Configurações → Usuários. O import Moodle atual:
- não parseia `pmc_role_assignments` / `pmc_context` para identificar `editingteacher` / `teacher`;
- não sincroniza professores com `usuarios` nem com `ava_users`.
Além disso, o campo `instrutor` em `aulas` é só texto livre digitado na hora de gerar a lista — nunca teve e-mail associado.

## Plano da correção

### A. Alunas — propagar e-mail (e telefone) do AVA para beneficiárias existentes

Em `src/lib/moodle-import.functions.ts`, no bloco de cruzamento pós-import por CPF, **antes** de fazer o `update({ beneficiaria_id })`, também sincronizar campos de contato da beneficiária, sem sobrescrever o que já existe:

```ts
// para cada u de ava_users com CPF que mapeia para beneficiaria bid:
const patch: Record<string, string> = {};
if (u.email)    patch.email    = u.email;     // só se AVA tem
// (opcional) telefone se decidirmos
if (Object.keys(patch).length) {
  await admin.from("beneficiarias")
    .update(patch)
    .eq("id", bid)
    .or("email.is.null,email.eq."); // só quando estiver vazio
}
await admin.from("ava_users").update({ beneficiaria_id: bid })...
```

E o mesmo tratamento em `gerarBeneficiariasAvaFromMoodle` (fluxo manual "Sugestões AVA"), para casos em que a beneficiária já existia mas sem e-mail.

Contabilizar em `resumo.emails_preenchidos` para o usuário ver no relatório da importação.

### B. Retro-preenchimento das alunas já importadas

Como o dump já foi processado e as beneficiárias ficaram sem e-mail, criar uma **server function `sincronizarEmailsBeneficiariasFromAva`** (coordenação geral) que roda uma vez para preencher e-mails que hoje estão em `ava_users` mas faltando em `beneficiarias`, respeitando "não sobrescrever". Botão discreto na tela de import Moodle: "Sincronizar e-mails com o AVA".

### C. Professores — dois caminhos

Como professores hoje não têm ponte com o AVA, proponho:

1. **Estender o parser** para incluir `pmc_role_assignments`, `pmc_role`, `pmc_context` — o suficiente para identificar quais `pmc_user` são professores (shortname `editingteacher`/`teacher`) em quais cursos. Registrar isso numa tabela nova `ava_instrutores_curso` (aluno/professor id, ava_course_id, role_shortname).
2. **Ao final do import**, para cada professor identificado, procurar em `usuarios` por CPF **ou e-mail**. Se achar, preencher `usuarios.email` quando estiver vazio (nunca sobrescrever). Se não achar, listar em `resumo.professores_sem_vinculo` para a coordenação criar manualmente — não crio usuário no `auth.users` automaticamente porque cria sessão sem senha e envolve política de acesso.

Se você preferir, dá pra pular o passo 1 (não guardar `ava_instrutores_curso`) e só usar o role_assignments em memória durante o import, apenas para produzir o mapa "moodle_id → é professor" e sincronizar `usuarios.email` na hora. Mais leve; perde o histórico de quais professores lecionam onde no AVA.

### D. Escopo do que NÃO vou tocar

- Não altero a UI de cadastro de alunas/usuários — só o pipeline de import e o cruzamento pós-import.
- Não crio usuário no `auth.users` automaticamente para professor novo (isso continua manual em Configurações → Usuários).
- Não mexo em `instrutor` (texto livre) das aulas — é um campo de exibição, não é ligado a usuário.

## Perguntas antes de implementar

1. **Sobrescrever ou não?** Para alunas que já têm `email` cadastrado (do CSV) mas o AVA tem outro e-mail, mantenho o do CSV (recomendado, para não perder o dado do formulário) ou sobrescrevo pelo do AVA?
2. **Telefone**: aproveito para propagar também? O `pmc_user` do Moodle tem `phone1`/`phone2` mas nem sempre está preenchido.
3. **Professores — nível de sincronia**: opção (C.1) mais completa (tabela `ava_instrutores_curso`) ou (C.2) só sincronizar e-mail de `usuarios` sem persistir vínculo curso↔professor?
4. **Botão de retro-preenchimento (B)**: coloco na mesma página do "Importar Moodle" como ação separada, ou disparo automaticamente sempre que um novo dump termina?
