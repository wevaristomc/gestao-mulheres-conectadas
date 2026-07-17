
## Contexto (análise da reunião + do banco real)

Na conversa com a Jaqueline, o eixo é conciliar o extrato bancário (idealmente CSV com nome/CPF do favorecido) com quem recebeu o benefício de R$ 260. Para isso funcionar, o cadastro da aluna precisa carregar **banco, agência e conta**, e essas informações precisam aparecer nas telas certas.

O que verifiquei no código/DB:

- `beneficiarias` já tem colunas `banco`, `agencia`, `conta`.
- O formulário `BeneficiariaFormDialog` já grava esses campos.
- O importador de CSV de turma (`importador-turma-csv.ts` / `importar-turma-csv-card.tsx`) já extrai e grava banco/agência/conta nas beneficiárias.
- Porém, **nenhuma tela exibe** esses campos: a lista de MTE › Beneficiárias mostra só nome/CPF/telefone/município; a aba Pedagógico › Turma › Cursistas mostra só nome/e-mail/status. Por isso o usuário "subiu e não viu refletido".
- A tabela `cursistas` (usada no fluxo pedagógico) **não tem** colunas bancárias — hoje o dado bancário só existe em `beneficiarias`.

## O que fazer

### 1. Tornar os dados bancários visíveis onde a aluna aparece
- **MTE › Beneficiárias**: adicionar coluna "Dados bancários" (Banco • Ag. • Conta) na tabela desktop e uma linha secundária no card mobile. Indicador visual quando faltar (badge "sem conta") para a coordenação priorizar a coleta.
- **Pedagógico › Turma › Cursistas**: quando a matrícula estiver vinculada a uma `beneficiaria`, exibir a mesma coluna "Dados bancários" puxada de `beneficiarias` via join na query (`cursistasByTurmaOptions`). Para matrículas ligadas só a `cursistas` (sem beneficiaria), mostrar "—" com tooltip "cadastro somente pedagógico".
- **Busca**: permitir buscar beneficiária por banco/conta na tela MTE (útil para achar a dona de um lançamento do extrato).

### 2. Edição rápida na própria linha
- Botão "Editar dados bancários" na linha da cursista/beneficiária que abre um mini-dialog só com Banco / Agência / Conta, sem precisar entrar no formulário completo. Preenche em `beneficiarias`. Se a aluna estiver só como `cursista` sem `beneficiaria`, oferecer "Promover a beneficiária" (cria a beneficiária com CPF/nome já existentes e grava as contas).

### 3. Exportação para a Jaqueline validar
- Botão "Exportar contas (CSV)" na tela de Beneficiárias e no cabeçalho da aba Cursistas da turma: gera CSV com `nome, cpf, banco, agencia, conta, turma, status` (BOM UTF-8, já padronizado no projeto). É o insumo que ela pediu na reunião para bater com o extrato do Mauro.

### 4. Ligação com a Conciliação bancária (preparo)
- Na tela `financeiro.conciliacao`, hoje o match usa valor/data. Adicionar como reforço opcional: quando o lançamento tiver "contraparte" (nome/CPF) ou "documento" (conta), casar com `beneficiarias.cpf` ou `beneficiarias.conta` para elevar o score da sugestão. Isso concretiza o "mamão com açúcar" do CSV que a Jaqueline quer.
- Sem migração nova: a estrutura de `conciliacoes_bancarias` já suporta score/sugerido/confirmado.

### 5. Documentação
- Registrar em `docs/AUDITORIA-BUGS.md` como item concluído: "Dados bancários da aluna visíveis e editáveis nas listas + export CSV + reforço no matcher da conciliação".

## Detalhes técnicos

- `src/lib/mte-queries.ts`: `beneficiariasListOptions` já retorna `banco/agencia/conta` — só falta consumir no componente.
- `src/lib/pedagogico-queries.ts` › `cursistasByTurmaOptions`: estender o `select` para incluir `beneficiarias(banco, agencia, conta)` no join (já existe o vínculo `matriculas.beneficiaria_id`). Manter compat com bases antigas via retry progressivo, como já é feito para outros campos.
- Novos componentes: `BankFieldsInlineDialog` (edição rápida), `ExportContasButton` (CSV com `csv.ts`).
- Sem mudanças de RLS: `beneficiarias` já tem policies de escrita para admin/coordenação/administrativo.
- Sem migrações novas.

## Fora do escopo desta rodada
- Integrar com "transfer gov" / API do banco.
- OCR das fichas manuscritas para preencher conta automaticamente (é outro pedido da reunião — encaminho como próxima rodada).
- Adicionar colunas bancárias na tabela `cursistas` (fica em `beneficiarias`, que é o modelo já vigente).
