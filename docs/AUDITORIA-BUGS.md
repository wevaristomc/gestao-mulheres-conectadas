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
| P2 | Signed URLs de evidências (`storage.from("documentos").createSignedUrl`) expiram; renovar sob demanda no clique do link em vez de embutir na listagem. | `mte.evidencias.tsx`, `comprovacao-turma-card.tsx` | M |
| P3 | Exportações de listas com 270+ linhas rodam síncronas na UI (jsPDF + XLSX). Mover para `requestIdleCallback`/worker para não travar telas grandes. | `lista-presenca-gerador.ts`, `lista-entrega-gerador.ts` | B |
| P6 | Import de listas IA / consolidado / Moodle: mensagens de erro devem incluir número da linha e valor bruto; hoje falham silenciosamente em alguns caminhos. | `leitor-lista.ts`, `moodle-import.functions.ts` | M |
| P7 | Views `vw_*` (DEQ IV/V/VI): validar que filtram por `status IN ('concluinte','ativo')` normalizado e não por texto livre; incluir teste SQL com `LOWER(TRIM(status))`. | migrations SQL | A |
| P8 | Orbe: ferramentas `frequencia_resumo` / `metas_status` / `etapas_status` precisam de guarda de divisão por zero e filtro de papel (professor não deve ver dado consolidado global). | `orbe.functions.ts` | M |
| P10 | XLSX (`dialog-lista-detalhada`): quando não há aulas na turma, o arquivo é gerado com abas quase vazias sem aviso. Bloquear geração + toast informativo. | `dialog-lista-detalhada.tsx` | B |
| P11 | `try/catch` com `toast.error` em todos os handlers `gerar*` — auditar geradores que ainda deixam falha silenciosa (relação-horas-pdf, oficio-49148). | `oficio-49148.functions.ts`, `relacao-horas-pdf.ts` | M |
| P12 | Padrão "240h horas" (concatenação de unidade duplicada): grepar `${…}h horas` / `${…} minutos horas` no repo periodicamente; unificar em util `formatarHoras(minutos)`. | vários | B |

## Como reutilizar

```ts
import { parseISODateLocal, formatarDataBR, pctSeguro } from "@/lib/date-utils";
import { txt } from "@/lib/date-utils";
import { normalizarCPF, formatarCPF, validarCPF } from "@/lib/cpf";
import { isMatriculaAtiva, contarAtivas, FILTRO_STATUS_INATIVOS } from "@/lib/contagens";

const d = parseISODateLocal("2026-06-09");     // Date local, sem shift
formatarDataBR("2026-06-09");                  // "09/06/2026"
pctSeguro(presentes, total);                   // 0 quando total=0
txt(undefined, "—");                            // "—" (nunca "undefined" literal em PDF)
formatarCPF("12345678901");                    // "123.456.789-01"
contarAtivas(matriculasRows);                  // ignora evadida/desistente/cancelada
// PostgREST count-only:
// .from("matriculas").select("id",{count:"exact",head:true}).not("status","in",FILTRO_STATUS_INATIVOS)
```

_Última varredura: 2026-07-14. Rodada 1 (P1/P4/P5/P9) aplicada._