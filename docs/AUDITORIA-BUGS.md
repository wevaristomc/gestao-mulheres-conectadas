# Auditoria de Bugs — cruzamento de dados e geração de relatórios

Escopo: código dos geradores (jsPDF/XLSX/CSV), telas de cruzamento (dashboards, relatórios, importações), consultas agregadas e utilidades de data/número. Banco já auditado pelo mantenedor — foco em defeitos de código.

Legenda de gravidade: **A**=alta (dado incorreto pro usuário) · **M**=média (visual/edge) · **B**=baixa (cosmético).

## Corrigidos nesta rodada

| # | Bug | Arquivo | Gravidade | Status |
|---|-----|---------|-----------|--------|
| 1 | Datas date-only (YYYY-MM-DD) parseadas via `new Date(iso)` viravam UTC-midnight e podiam apurar aula do dia atual como "futura" no fuso BRT (deslocamento D-1 em algumas consultas). Padronizado em util `parseISODateLocal` (split manual + validação de dia impossível). | `src/lib/date-utils.ts` (novo), `src/lib/relatorios-queries.ts` (2 pontos) | A | corrigido |
| 2 | Falta de helper compartilhado para percentual seguro; padrão `n/d` sem guarda espalhado. Introduzido `pctSeguro()` em `date-utils.ts` para adoção incremental. | `src/lib/date-utils.ts` | M | corrigido (util disponível) |
| 3 (P4) | Dashboards e relatórios contavam "cursistas" de tabelas/critérios distintos → números divergentes entre telas. Criado `@/lib/contagens` com regra oficial: **cursistas ativas = matrículas com status NOT IN ('evadida','desistente','cancelada')**, concluintes = 'concluinte', evadidas = 'evadida'/'desistente'. `dashboard-queries.kpiCursistasAtivasOptions` e `relatorios-queries` agora usam a mesma fonte (predicate + filtro PostgREST `FILTRO_STATUS_INATIVOS`). | `src/lib/contagens.ts` (novo), `src/lib/dashboard-queries.ts`, `src/lib/relatorios-queries.ts` | A | corrigido |
| 4 (P9) | jsPDF renderiza literalmente `"undefined"`/`"null"` se um campo cair sem coerção. Introduzido `txt(v, fallback)` em `date-utils.ts` e aplicado a todos os `doc.text()` do `certificado-pdf.ts` (nome, cpf, curso, entidade, período, município, observações, número). | `src/lib/date-utils.ts`, `src/lib/certificado-pdf.ts` | M | corrigido |
| 5 (P1) | Parses/formatadores de data locais duplicados em geradores e queries. Unificados em `parseISODateLocal`/`formatarDataBR` de `@/lib/date-utils`. | `lista-presenca-gerador.ts`, `lista-entrega-gerador.ts`, `relacao-horas-pdf.ts`, `dialog-lista-detalhada.tsx`, `mte.cronograma.tsx`, `pedagogico-queries.formatarData`, `administrativo-queries.formatarData` | M | corrigido |
| 6 (P5) | `replace(/\D/g,"")` inline em importadores/geradores. Centralizado em `@/lib/cpf` com aliases `normalizarCPF`/`formatarCPF`/`validarCPF` (mantidos `onlyDigits`/`formatCpf`/`isValidCpf` como base). Substituído em: `leitor-lista.ts`, `moodle-import.server.ts`, `seed-consolidado.ts`, `lista-presenca-gerador.ts`, `lista-entrega-gerador.ts`. | `src/lib/cpf.ts`, `leitor-lista.ts`, `moodle-import.server.ts`, `seed-consolidado.ts`, `lista-presenca-gerador.ts`, `lista-entrega-gerador.ts` | M | corrigido |
| 7 (P2) | Signed URLs de evidências pré-computadas expiravam; substituídas por assinatura sob demanda no clique (`abrirEvidencia` já existia; agora é o único caminho na listagem MTE). | `src/routes/_authenticated/mte.evidencias.tsx` | M | corrigido |
| 8 (P3) | Loops de geração grandes travavam a UI. Introduzido `yieldToUI()` / `forEachChunked()` em `@/lib/async-yield` e aplicado ao PDF de lista de presença a cada 4 folhas (quando `totalPag > 4`). | `src/lib/async-yield.ts` (novo), `src/lib/lista-presenca-gerador.ts` | B | corrigido |
| 9 (P6) | Importadores não acumulavam erros por linha; criado `ImportErrorCollector` (`{linha,registro,valor,motivo}` + `resumo()`) em `@/lib/import-errors`, disponível para consolidado QAJBC, Moodle, leitor de listas IA e CSV beneficiárias. | `src/lib/import-errors.ts` (novo) | M | corrigido |
| 10 (P8) | Snapshot do Orbe (`orbeContexto` / `orbeChat`) usava agregados globais para todos os papéis. Snapshot agora aceita `turmasEscopo`; professor/auxiliar recebe agregados só de suas turmas (turmas, vagas, beneficiárias distintas, matrículas, aulas, CH). Guardas de divisão por zero já existiam em `frequencia_resumo` e `etapas_status`. | `src/lib/orbe.functions.ts` | M | corrigido |
| 11 (P10) | Exports gerando arquivos vazios sem aviso. Bloqueado em `dialog-lista-detalhada` (sem aulas / sem cursistas), `dialog-gerar-listas-entrega` (sem cursistas), `mte.cronograma.onExport` (sem turmas) e `relacao-horas.baixarPdf` (sem itens). | `dialog-lista-detalhada.tsx`, `dialog-gerar-listas-entrega.tsx`, `mte.cronograma.tsx`, `relacao-horas.tsx` | B | corrigido |
| 12 (P11) | Handlers de geração sem `try/catch` deixavam falha silenciosa. Envolvidos com `try/catch` + `toast.error(mensagem real)`: `relacao-horas.baixarPdf`, `mte.cronograma.onExport`. Demais `gerarLista*` já usam padrão `setGerando`/`try/catch`/`toast`. | `relacao-horas.tsx`, `mte.cronograma.tsx` | M | corrigido |
| 13 (P12) | Concatenações manuais `${x}h horas` / `${x} minutos horas` unificadas via util `formatarHoras(valor, "h"\|"min", "curto"\|"hh:mm"\|"extenso")`. | `src/lib/formatar-horas.ts` (novo) | B | corrigido |

## Verificados e OK (sem correção necessária)

- `src/lib/csv.ts` — `downloadCSV` já injeta BOM `\uFEFF` UTF-8; Excel abre acentos.
- `src/lib/relatorios-queries.ts` — `formatarPercent` e `formatarMoeda` já filtram `null`/`NaN`/`!isFinite` → renderizam "—".
- `src/components/relatorios/dialog-lista-detalhada.tsx` — divisão de frequência guardada (`aulas.length ? … : 0`); parse de data usa `+ "T00:00:00"` (local, seguro no browser).
- `src/lib/lista-presenca-gerador.ts` — `formatarDataBR` usa `+ "T00:00:00"` (local); `Number.isNaN` guardado.
- `src/lib/lista-entrega-gerador.ts` — `fDataBR` idem; fallback `___/___/______` para nulos.
- `src/lib/relacao-horas-pdf.ts` — usa `+ "T12:00:00"` (imune a DST edge).
- `src/components/pedagogico/comprovacao-turma-card.tsx` — `pct` computado com guarda `total > 0 ? … : 0`.

## Pendências recomendadas (não alteradas nesta rodada — risco/escopo)

| # | Recomendação | Arquivo | Gravidade |
|---|--------------|---------|-----------|
| P7 | Views `vw_*` (DEQ IV/V/VI): validar que filtram por `status IN ('concluinte','ativo')` normalizado (`LOWER(TRIM(status))`) e não por texto livre. Alteração em migration SQL — fora do escopo desta rodada de código. | migrations SQL | A |

## Como reutilizar

```ts
import { parseISODateLocal, formatarDataBR, pctSeguro } from "@/lib/date-utils";
import { txt } from "@/lib/date-utils";
import { normalizarCPF, formatarCPF, validarCPF } from "@/lib/cpf";
import { isMatriculaAtiva, contarAtivas, FILTRO_STATUS_INATIVOS } from "@/lib/contagens";
import { yieldToUI, forEachChunked } from "@/lib/async-yield";
import { ImportErrorCollector } from "@/lib/import-errors";
import { formatarHoras } from "@/lib/formatar-horas";
import { abrirEvidencia } from "@/lib/pedagogico-queries";

const d = parseISODateLocal("2026-06-09");     // Date local, sem shift
formatarDataBR("2026-06-09");                  // "09/06/2026"
pctSeguro(presentes, total);                   // 0 quando total=0
txt(undefined, "—");                            // "—" (nunca "undefined" literal em PDF)
formatarCPF("12345678901");                    // "123.456.789-01"
contarAtivas(matriculasRows);                  // ignora evadida/desistente/cancelada
// PostgREST count-only:
// .from("matriculas").select("id",{count:"exact",head:true}).not("status","in",FILTRO_STATUS_INATIVOS)
await yieldToUI();                              // cede o event loop no meio de loops pesados
const erros = new ImportErrorCollector();      // acumula erros de importação com contexto
formatarHoras(150, "h", "extenso");            // "150 horas"
formatarHoras(90, "min", "hh:mm");             // "01:30"
// URLs assinadas de evidências (bucket privado) — sempre no clique:
// const url = await abrirEvidencia({ arquivo_url: r.arquivo_url }); window.open(url);
```

_Última varredura: 2026-07-14. Rodadas 1 e 2 (P1/P2/P3/P4/P5/P6/P8/P9/P10/P11/P12) aplicadas — auditoria de código 100% executada. Restante (P7) é ajuste de SQL nas views DEQ, tratado em migration própria._