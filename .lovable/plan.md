# Importar lista de presença do Google Drive + status de verificação por documento

## Contexto (o que já existe)

O pipeline de leitura de lista de presença **já está pronto** em `/mte/importar-lista`:

- `src/lib/leitor-lista.ts` — PDF → PNGs (via `pdfjs-dist`), cruzamento com matrículas por CPF/nome, gravação em `aulas` + `presencas` + `entregas_beneficios` + `evidencias` + `importacoes_presenca` (é isso que alimenta a frequência no Pedagógico via `matricula.frequencia_percentual`).
- `src/lib/ia.functions.ts` — prompt de IA que já lê cabeçalho (turma, data, instrutor, horário, CH, conteúdo) e detecta, linha por linha, **assinatura presente** na coluna Assinatura + "Sim" na coluna Frequência.
- `GDrivePicker` (`src/components/gdrive/gdrive-picker.tsx`) e `downloadFileBase64` (`src/lib/gdrive-helpers.server.ts`) — já em uso em outros pontos do sistema.

Vou aproveitar tudo isso e acrescentar três coisas:

## 1. Importação de PDF de lista de presença direto do Drive

Novos itens:

- Server function nova em `src/lib/leitor-drive.functions.ts`:
  `baixarPdfDoDrive({ fileId })` com `requireSupabaseAuth`, valida papel (coordenador_geral / coordenador_pedagogico / instrutor), chama `downloadFileBase64`, rejeita mime que não seja `application/pdf` ou `image/*`, devolve `{ nome, mime, base64, tamanho }`.
- Na tela `/mte/importar-lista`, ao lado do `<Input type="file">` atual, adiciono botão **"Escolher do Google Drive"** que abre o `GDrivePicker` existente. Quando o usuário escolhe, reconstruo um `File` a partir do base64 e sigo pelo mesmo `arquivoParaImagensBase64(file)` → IA → `cruzarComMatriculas` → tabela de conferência que já existe. Um badge acima do input mostra `Origem: Google Drive · <nome>` ou `Origem: Upload local`.

## 2. Cabeçalho analisa também o endereço e sugere atualização da turma

O prompt de IA em `ia.functions.ts` já extrai turma/data/instrutor/horário/CH/conteúdo. Adiciono no schema:

- `endereco: string | null` (rua/número/bairro/cidade impressos no cabeçalho).

E no cabeçalho editável da tela:

- Campo **"Endereço da unidade"** que aparece pré-preenchido pelo OCR.
- Se `turmas.local_endereco` estiver vazio ou for diferente do lido, mostro um botão **"Atualizar endereço da turma"** que grava em `turmas.local_endereco` (via mutation simples usando o client Supabase). Não crio tabela nova de "unidades" — o campo `local_endereco` da turma já cumpre esse papel no modelo atual e evita duplicar dado.

Quanto ao **professor**: o cabeçalho já traz o nome do instrutor. Se `turmas.professor_nome` estiver vazio ou diferente, exponho o mesmo padrão de botão **"Atualizar professor da turma"** — mesma mutation, mesmo comportamento.

Nada disso é automático: o usuário revê o cabeçalho e decide antes de gravar (é a mesma etapa de conferência humana que já existe).

## 3. Status de revisão por documento (verificado / reanálise / em análise)

Nova migration (uma só) em cima da tabela `importacoes_presenca`, que já registra cada PDF importado:

```sql
ALTER TABLE public.importacoes_presenca
  ADD COLUMN IF NOT EXISTS revisao_status text
    NOT NULL DEFAULT 'em_analise'
    CHECK (revisao_status IN ('em_analise','verificado','reanalise_solicitada')),
  ADD COLUMN IF NOT EXISTS revisao_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revisao_em timestamptz,
  ADD COLUMN IF NOT EXISTS revisao_observacao text;
```

Na tela `/mte/importar-lista`, na tabela **"Histórico de importações"** que já existe no final da página, acrescento uma coluna **"Revisão"** e, ao clicar numa linha do histórico, mostro três ações:

- **Marcar como verificado** — grava `verificado` + `revisao_por = auth.uid()` + `revisao_em = now()`.
- **Solicitar reanálise** — abre um campo `revisao_observacao` obrigatório (ex.: "3 assinaturas ilegíveis, refazer OCR") e grava `reanalise_solicitada`.
- **Voltar para em análise** — reset simples.

Cada status exibe um Badge colorido (cinza / verde / âmbar).

O mesmo modelo serve para os **outros tipos de documento** subidos (ficha de inscrição, entrega de benefícios, relação de qualificados) porque a tabela `importacoes_presenca` já é o registro central por PDF, e as ações são independentes do tipo.

## Verificação depois de pronto

Abrir `/mte/importar-lista`, selecionar turma, clicar em "Escolher do Google Drive", pegar um PDF de lista já digitalizado do drive do projeto, conferir se o cabeçalho traz turma/data/professor/endereço, clicar em "Atualizar endereço" se aparecer diferente, "Confirmar e registrar", depois no histórico marcar a importação como "Verificado" — e conferir em `/pedagogico/turmas/<id>/frequencia` se as presenças aparecem lançadas.

## Fora do escopo

- Não crio tabela `unidades` nova (o `local_endereco` da turma já cobre esse campo no modelo atual — se depois precisar de uma unidade compartilhada entre turmas, aviso).
- Não faço importação em lote de vários PDFs da mesma pasta do Drive — mantenho um por vez para preservar a conferência humana.
- Não mexo no card Importação Consolidada QAJBC, no card do Ofício 49148/2026 nem no Cronograma.
