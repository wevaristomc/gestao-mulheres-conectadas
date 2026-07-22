
# Dashboard de Inscrições (Painel Geral + Regiões + Faixa Etária + Perfil Social + Bairros)

Reproduzir dentro do app o mesmo dashboard do Excel `Relatorio_Pre_Inscricoes_Mulheres_2026.xlsx`, alimentado ao vivo pela base de `inscricoes_digitais` (a mesma que já abastece Administrativo → Inscrições e o relatório por região).

## Onde vai ficar
- Nova rota `/_authenticated/administrativo/inscricoes-dashboard` (aba/atalho no topo da tela Inscrições — botão "Dashboard" ao lado dos filtros existentes).
- Aproveita o mesmo guard e papéis do módulo administrativo.

## Seções (espelhando as abas do Excel)
1. **Painel Geral** — cards:
   - Respostas recebidas, Candidatas únicas, Duplicidades removidas, Concentração em Betim (%).
   - Indicadores: idade média, mediana, não trabalhando, até 1 SM, beneficiárias de programa social, disponíveis em >1 turno, elegíveis preliminarmente, cadastros para revisão, restrição alimentar, deficiência.
2. **Por Região/Cidade** — tabela + gráfico de barras: candidatas, % base, idade média, não trabalhando, até 1 SM, programa social, manhã/tarde/noite.
3. **Faixa Etária** — tabela + barras empilhadas com os mesmos cortes do Excel (até 15, 16-17, 18-24, 25-34, 35-44, 45-54, 55+).
4. **Perfil Social** — situação de trabalho, faixa de renda, programa social (donuts/barras).
5. **Bairros de Betim** — top N + tabela completa filtrável.
6. **Pendências** — lista de cadastros marcados para revisão (mesma regra usada hoje em "Cadastros para revisão").

Cada seção tem botão "Gerar análise com IA" reutilizando `AnaliseIA` (já funciona depois da correção da migração `ia_*`).

## Como os números são calculados
- Fonte única: `listarInscricoesDigitais` (já existe) + novo server fn `dashboardInscricoes` em `src/lib/inscricoes-digitais.functions.ts` que devolve tudo agregado em uma chamada para evitar N idas ao banco.
- Deduplicação por CPF normalizado (`onlyDigits`) — "duplicidades removidas" = total − únicas.
- "Elegíveis preliminarmente" / "Cadastros para revisão" usam as mesmas regras do relatório atual (idade ≥ 16, CPF válido, endereço mínimo).
- Datas via `parseISODateLocal`; percentuais via `pctSeguro` (padrão da auditoria).

## Exportação
- Botão "Exportar XLSX" no topo, gera um arquivo com as mesmas 5 abas do exemplo usando `xlsx` (já no bundle via `certificado-pdf`/outros; se não estiver, adicionar `xlsx`).
- Botão "Imprimir" abre versão print-friendly.

## Arquivos
- Novo: `src/routes/_authenticated/administrativo.inscricoes-dashboard.tsx`
- Novo: `src/components/inscricoes/dashboard-*` (cards, tabela regiões, gráficos faixa etária, perfil social, bairros)
- Novo: `src/lib/inscricoes-dashboard.ts` (agregações puras + testáveis)
- Editar: `src/lib/inscricoes-digitais.functions.ts` — adicionar `dashboardInscricoes` server fn
- Editar: `src/routes/_authenticated/administrativo.inscricoes.tsx` — botão "Abrir dashboard"
- Editar: `src/components/app-sidebar.tsx` — item de menu "Dashboard de inscrições" dentro de Administrativo

## Gráficos
Usar `recharts` (já no projeto) — bar chart p/ regiões e faixas, pie/donut p/ perfil social.

## Fora de escopo
- Não altera schema do banco.
- Não mexe no fluxo de aprovação/rejeição de inscrições.
- Sem novos secrets ou conectores.
