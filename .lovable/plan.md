
# Plano — Evolução em 4 Frentes

Migration P0 já aplicada no banco (metas seed, rubricas, certificados_lotes+seq, municipios_ibge, rubrica_id em despesas/orcamento_itens, views vw_relacao_qualificados e vw_indicadores_ciclo). Confio no schema existente e não recrio nada.

Entrego em fases pequenas (1 build por fase). Cada fase termina em algo utilizável.

---

## FRENTE A — Prestação de Contas (P0)

### Fase A1 — Metas & Indicadores
- Nova rota `/relatorios/metas-indicadores` (ou aba em Visão Geral) lendo `vw_indicadores_ciclo`.
- Cards agregados (vagas previstas, matriculadas, concluintes, certificadas, % vs meta, freq. média).
- Tabela detalhada com filtro por ciclo e semáforo verde ≥90% / amarelo 60–89% / vermelho <60%.
- CRUD leve em `metas` (dialog editar `vagas_previstas`, `meta_conclusao_pct`, `meta_frequencia_pct`).
- **Riscos:** RLS de `metas` — precisará conferir policies (SELECT autenticado; UPDATE admin/coordenação). Se view não estiver acessível, cair para query direta com joins.

### Fase A2 — Rubricas no Financeiro
- Nova rota `/financeiro/rubricas` com listagem + edição inline de `valor_previsto` e painel previsto × executado (soma de `despesas.valor` agrupada por `rubrica_id`).
- Adicionar select "Rubrica" em `financeiro.orcamento.tsx` (form de item) e `financeiro.despesas.tsx` (form de despesa). Persistir `rubrica_id`.
- Atualizar `financeiro-queries.ts` para incluir `rubrica_id` nos upserts.
- **Riscos:** colunas `rubrica_id` só existem se as tabelas existirem; queries usam `pickFirst` tolerante, mas o select precisa degradar se rubricas não vierem.

### Fase A3 — Exports de Prestação de Contas
- Em `/relatorios/mte`, adicionar 2 cards:
  - **Relação de Qualificados (XLSX)** — lê `vw_relacao_qualificados`. Sheet com cabeçalho de identificação do instrumento (Modalidade: Termo de Fomento MROSC; CNPJ/Nome: QUINTA ARTE; TransfereGov 01025/2025; NUP/SEI 19968.200342/2025-94; vigência) + tabela oficial. Frequência formatada como decimal 0–1.
  - **Execução Físico-Financeira por Rubrica (XLSX)** — join rubricas + despesas + orcamento_itens: código, descrição, previsto, executado, saldo, % execução, totais.
- Reutilizar `xlsx` (`XLSX.utils.aoa_to_sheet` + merges) igual ao cronograma atual.
- **Riscos:** dados do instrumento hoje não estão no banco — vão como constantes no export (documentar).

### Fase A4 — Certificados em Lote
- Botão "Gerar Certificados do Lote" na página da turma (`pedagogico.turmas.$id.cursistas.tsx` ou nova aba "Certificados").
- Elegibilidade: `frequencia_percentual >= 75` AND status concluinte.
- Server function `gerarLoteCertificados` (middleware auth):
  1. Cria linha em `certificados_lotes`.
  2. Para cada elegível: `nextval('seq_certificado')` → grava `certificado_numero`, `certificado_data`, `certificado_emitido=true` na matrícula.
  3. Retorna lista com números atribuídos.
- Cliente: gera PDFs com `jsPDF` (paisagem A4) reaproveitando `certificado-pdf.ts` estendido com layout oficial PMQ (logos do bucket `evidencias/marca/`, curso, CH 150h, período, município, texto padrão PMQ, número sequencial). Baixa ZIP via `jszip` + XLSX "Lista de Entrega".
- **Riscos:** logos ainda não estão no bucket — layout deve tolerar ausência (fallback: só texto). Confirmar que `seq_certificado` foi criada como sequence (usar RPC `nextval` via server fn com admin ou função SECURITY DEFINER). Precisará adicionar deps: `jszip`.

---

## FRENTE B — Leitor de PDFs Universal

### Fase B1 — Seletor de tipo + arquitetura
- Em `/mte/importar-lista` (renomear rota UI para "Importar Documento") adicionar select "Tipo de documento": Lista de Presença | Ficha de Inscrição | Lista de Entrega de Benefícios | Relação de Qualificados Preenchida.
- Refatorar `leitor-lista.ts` em um dispatcher por tipo. Cada tipo → prompt de visão IA específico + schema Zod de saída → tela de conferência ✅⚠️❌ → confirmação → gravação.
- **Riscos:** custo/latência de IA visão; garantir uso do gateway Lovable AI existente.

### Fase B2 — Ficha de Inscrição
- Prompt extrai: nome, CPF, RG, data nasc, endereço, telefone, escolaridade, renda, dependentes, curso pretendido, município.
- Match por CPF em `beneficiarias`; se não existir, cria em status "conferência". Cria/atualiza matrícula em conferência.

### Fase B3 — Lista de Entrega de Benefícios
- Prompt extrai linhas (nome/CPF/tipo/assinatura presente?). Grava em `entregas_beneficios` em lote, marcando divergências.

### Fase B4 — Relação de Qualificados Preenchida
- Prompt extrai linhas do modelo oficial e faz reconciliação com `vw_relacao_qualificados`: aponta divergências (nome, CPF, frequência, status) em tela.

---

## FRENTE C — Super Apuração

### Fase C1 — Varredura & Correções
- Rodar `tsgo` typecheck completo.
- Percorrer todas as rotas em `src/routes/_authenticated/**` verificando: console/runtime errors, botões sem handler, telas em branco, loading preso, RLS quebrado após migration P0 (foco em `metas`, `rubricas`, `certificados_lotes`, `municipios_ibge`, `despesas`, `orcamento_itens`).
- Playwright em rota-chave (`/mte`, `/financeiro`, `/relatorios/*`, `/pedagogico/turmas`) para captura de console + screenshot mobile (375×812) e desktop.
- Corrigir e listar tudo.
- **Riscos:** apuração pode revelar issues fora do escopo — vou triar e reportar sem expandir escopo.

---

## FRENTE D — Identidade Visual PMQ

### Fase D1 — Tokens & tipografia
- Atualizar `src/styles.css`:
  - `--primary: oklch(...)` equivalente a `#1a2b52` (azul-marinho)
  - `--secondary`/`--accent-action` para `#d4552b` (terracota)
  - `--accent`/highlight para `#f5a833` (âmbar)
  - `--font-sans: "Rawline", system-ui, ...`
- Carregar TTFs Rawline via `<link>`/`@font-face` a partir de `evidencias/marca/` (URL pública do bucket). Fallback system-ui garantido.
- Conferir contraste AA (título/texto sobre primária, botões terracota sobre fundo claro).

### Fase D2 — Aplicação
- Logo PMQ no topo da `AppSidebar` e na tela `/auth`.
- Header/cabeçalhos com azul-marinho, ações primárias em terracota, badges/destaques em âmbar.
- Rever contraste de estados hover/active e componentes shadcn afetados (Button variants, Sidebar).
- **Riscos:** arquivos de fonte e logo dependem de upload do usuário; fase entra parcial até estarem no bucket (fallback preserva app usável).

---

## Ordem sugerida de execução
1. D1 (tokens/fonte) — base visual barata, desbloqueia identidade.
2. A1 → A2 → A3 → A4 (prestação de contas do mais leve ao mais pesado).
3. B1 → B2 → B3 → B4.
4. D2 (logo/aplicação) quando os assets chegarem.
5. C1 varredura final antes de encerrar.

## SQLs adicionais que posso pedir depois
- Se `seq_certificado` não estiver como `SEQUENCE` acessível, precisarei de uma função `public.proximo_certificado()` SECURITY DEFINER para chamar do server. Envio o SQL no momento.
- Se `metas`/`rubricas`/`certificados_lotes` não tiverem policies para `authenticated`, envio o bloco de GRANT+POLICY.

## O que NÃO farei
- Não recrio nada da migration P0.
- Não toco em `.env`, `client.ts`, `types.ts`, schemas do Supabase Auth/Storage.
- Não expando escopo além do listado.
