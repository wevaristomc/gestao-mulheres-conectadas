## Escopo

Gerador de listas de presença pré-preenchidas por turma, uma folha por aula do cronograma, em PDF (imprimir), XLSX (editar antes de imprimir) e DOCX (Word).

## UI

### 1) Botão na tela da Turma (Pedagógico › Turmas › [id] › Aulas)
- Novo botão **"Gerar listas de presença"** ao lado dos existentes.
- Abre `DialogGerarListas` com:
  - Seleção de aulas: checkbox por aula do cronograma da turma, pré-marcadas todas as aulas com `data >= hoje`. Cabeçalho "Selecionar todas / Nenhuma / Só futuras".
  - Nº de linhas extras em branco: input numérico, default **5**.
  - Formato: radio **PDF** | **XLSX** | **DOCX** (default PDF).
  - Rodapé com totais: "N aulas × M cursistas + K extras = X folhas".
- Botão "Gerar" dispara download único do arquivo (multi-página no PDF/DOCX; múltiplas abas ou múltiplas seções no XLSX — ver detalhes).

### 2) Mesmo botão em MTE › Aulas
- Reutiliza o mesmo diálogo (turma já vem do contexto), atalho para o mesmo gerador.

## Geração — layout genérico PMC

Cabeçalho fixo em cada folha:
- Linha 1 (esq.): logo/nome **"Programa Manuel Querino"** + subtítulo **"Mulheres Conectadas"**.
- Linha 2 (esq.): "Lista de Frequência dos Cursistas às Aulas Teóricas e Práticas".
- Bloco de metadados (2 colunas): **Turma** (código + nome), **Município**, **Turno**, **Data da aula**, **Tema/Conteúdo**, **Carga horária**, **Instrutor(a)**.
- Tabela: `Nº | Nome completo | CPF | Assinatura` — CPF mascarado `***.***.***-**` (últimos 2 dígitos visíveis).
- Cursistas ordenadas alfabeticamente por nome; N linhas em branco no final (Nº seguindo a sequência, sem nome/CPF).
- Rodapé: linhas para **Assinatura do Instrutor(a)** e **Coordenação Pedagógica**, data por extenso, número da página `X/Y`.

## Implementação técnica

### Arquivos novos
- `src/lib/lista-presenca-gerador.ts` — funções puras:
  - `montarDadosLista({turma, aula, cursistas, extras})` → `ListaPresencaData`.
  - `gerarListaPDF(dados[]): Blob` usando **jsPDF** (já no projeto, ver `certificado-pdf.ts`). Multi-página com `doc.addPage()` a cada aula.
  - `gerarListaXLSX(dados[]): Promise<Blob>` usando **exceljs** (adicionar dep). Uma aba por aula, largura de coluna e bordas configuradas.
  - `gerarListaDOCX(dados[]): Promise<Blob>` usando **docx** (adicionar dep). Uma seção com quebra de página por aula.
- `src/components/pedagogico/dialog-gerar-listas.tsx` — o diálogo acima.

### Dependências novas
- `exceljs` (XLSX com formatação).
- `docx` (Word).
- `file-saver` já ausente — usar `URL.createObjectURL` + `<a download>` como já é feito em `certificado-pdf.ts`.

### Fonte de dados (cliente, sem server function)
- Turma: `turmasMteListOptions` já existente.
- Aulas: `aulasByTurmaOptions(turmaId)` → filtra pelas selecionadas.
- Cursistas: `supabase.from("matriculas").select("beneficiaria:beneficiarias(nome_completo, cpf)").eq("turma_id", turmaId).eq("status_ativa", true).order("beneficiaria(nome_completo)")`. Fallback se `status_ativa` não existir na tabela: filtra em memória por `situacao === "ativa"`.

### Integração
- Pontos de entrada: `src/routes/_authenticated/pedagogico.turmas.$id.aulas.tsx` (botão principal) e `src/routes/_authenticated/mte.aulas.tsx` (atalho passando turma selecionada).
- Nome do arquivo: `listas-presenca_<codigo_turma>_<YYYY-MM-DD>.{pdf|xlsx|docx}`.

## Fora do escopo

- Assinatura digital / QR code de validação.
- Envio automático por e-mail para instrutor.
- Edição do template do cabeçalho pela UI (fica fixo no código; futura personalização por projeto).
- Preenchimento pós-aula (OCR/importação) — já existe fluxo separado em `leitor-lista`.
- Mudanças em `certificado-pdf.ts` ou nos importadores.
