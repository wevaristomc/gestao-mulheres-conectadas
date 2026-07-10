import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { consultarViewMTE, consultarExecucaoFisicoFinanceira } from "@/lib/mte-relatorios.functions";
import { ComprovacaoTurmaCard } from "@/components/pedagogico/comprovacao-turma-card";
import { DialogListaDetalhada } from "@/components/relatorios/dialog-lista-detalhada";

type RelatorioDef = {
  view:
    | "vw_cronograma_execucao"
    | "vw_cursos_executados"
    | "vw_beneficiarias"
    | "vw_consolidacao_turma"
    | "vw_relacao_qualificados"
    | "vw_checklist_fiscalizacao"
    | "execucao_fisico_financeira";
  titulo: string;
  descricao: string;
  arquivo: string;
  cabecalhoDuplo?: boolean;
  variant?:
    | "relacao_qualificados"
    | "relacao_final_qualificados"
    | "execucao_ff"
    | "cursos_executados";
  deqItem?: string;
};

const INSTRUMENTO = {
  modalidade: "Termo de Fomento — MROSC",
  executora: "QUINTA ARTE",
  cnpj: "",
  transferegov: "01025/2025",
  nup_sei: "19968.200342/2025-94",
  vigencia: "",
};

const CABECALHO_CURSOS_EXECUTADOS =
  "Tipo de instrumento/parceria: Termo de Fomento — MROSC · Programa Manuel Querino / QUINTA ARTE";

// Rótulos oficiais MODELO_Cursos Executados.xlsx
const CURSOS_EXECUTADOS_COLS: { key: string; label: string; group?: "CH" | "PERIODO" }[] = [
  { key: "executora", label: "Executora" },
  { key: "nome_curso", label: "Nome Curso" },
  { key: "codigo_turma", label: "Código da Turma" },
  { key: "turno", label: "Turno" },
  { key: "horario_realizacao", label: "Horário de Realização" },
  { key: "ch_gerais", label: "Conhecimentos Gerais", group: "CH" },
  { key: "ch_especificos", label: "Conhecimentos Específico", group: "CH" },
  { key: "ch_total", label: "CH Total", group: "CH" },
  { key: "qtd_dias", label: "Quantidade de Dias de Curso" },
  { key: "periodo_inicio", label: "Início", group: "PERIODO" },
  { key: "periodo_fim", label: "Fim", group: "PERIODO" },
  { key: "municipio", label: "Município" },
  { key: "vagas", label: "Nº Vagas" },
  { key: "inscritas_matriculadas", label: "Nº Educ. Inscritos/Matriculados" },
  { key: "evadidas", label: "Nº de Evadidos" },
];

// Aliases best-effort para mapear vw_cursos_executados → colunas oficiais.
const CURSOS_EXECUTADOS_ALIASES: Record<string, string[]> = {
  executora: ["executora", "entidade_executora", "entidade"],
  nome_curso: ["nome_curso", "curso", "titulo_curso"],
  codigo_turma: ["codigo_turma", "codigo", "turma_codigo"],
  turno: ["turno"],
  horario_realizacao: ["horario_realizacao", "horario", "horario_realizacao_turma"],
  ch_gerais: ["ch_conhecimentos_gerais", "ch_gerais", "carga_horaria_gerais"],
  ch_especificos: ["ch_conhecimentos_especificos", "ch_especificos", "carga_horaria_especificos"],
  ch_total: ["ch_total", "carga_horaria_total", "ch"],
  qtd_dias: ["qtd_dias", "quantidade_dias", "dias_curso"],
  periodo_inicio: ["data_inicio", "periodo_inicio", "inicio"],
  periodo_fim: ["data_fim", "periodo_fim", "fim"],
  municipio: ["municipio", "municipio_realizacao"],
  vagas: ["vagas", "n_vagas", "qtd_vagas"],
  inscritas_matriculadas: [
    "matriculadas",
    "inscritas_matriculadas",
    "qtd_matriculadas",
    "n_matriculadas",
    "inscritas",
  ],
  evadidas: ["evadidas", "qtd_evadidas", "n_evadidas"],
};

function pegar(row: Record<string, unknown>, key: string): unknown {
  const aliases = CURSOS_EXECUTADOS_ALIASES[key] ?? [key];
  for (const a of aliases) {
    if (a in row && row[a] != null && row[a] !== "") return row[a];
  }
  return "";
}

// Grupos oficiais para o layout final SINE/MTE.
const REL_FINAL_GROUPS: {
  grupo: string;
  cols: { key: string; label: string; aliases?: string[]; type?: "date" | "pct01" | "int" }[];
}[] = [
  {
    grupo: "DADOS DA QUALIFICAÇÃO",
    cols: [
      { key: "ordem", label: "Ordem" },
      {
        key: "codigo_turma",
        label: "Código Único de Identificação (Turma)",
        aliases: ["codigo_turma", "turma_codigo"],
      },
      {
        key: "data_inicio",
        label: "Data de Início (Turma)",
        aliases: ["data_inicio", "turma_data_inicio"],
        type: "date",
      },
      {
        key: "data_fim",
        label: "Data de Conclusão (Turma)",
        aliases: ["data_fim", "turma_data_fim"],
        type: "date",
      },
      { key: "ch_total", label: "Carga Horária (Turma)", aliases: ["ch_total", "carga_horaria_total"] },
      {
        key: "modalidade_ensino",
        label: "Modalidade Ensino (Turma)",
        aliases: ["modalidade_ensino", "modalidade"],
      },
      {
        key: "codigo_ibge",
        label: "Código do IBGE do Município de Realização",
        aliases: ["codigo_ibge", "ibge_municipio", "municipio_ibge"],
      },
      {
        key: "codigo_curso",
        label: "Código Único de Identificação (Curso)",
        aliases: ["codigo_curso", "curso_codigo"],
      },
      {
        key: "nome_curso",
        label: "Nome de Identificação (Curso)",
        aliases: ["nome_curso", "curso"],
      },
    ],
  },
  {
    grupo: "DADOS DO BENEFICIÁRIO",
    cols: [
      { key: "cpf", label: "CPF" },
      { key: "nome", label: "Nome Completo", aliases: ["nome", "nome_completo"] },
      {
        key: "data_nascimento",
        label: "Data de Nascimento",
        aliases: ["data_nascimento", "nascimento"],
        type: "date",
      },
      { key: "idade", label: "Idade (Calculada)", type: "int" },
      { key: "raca_cor", label: "Raça/Cor Declarada", aliases: ["raca_cor", "raca"] },
      { key: "sexo", label: "Sexo de Registro", aliases: ["sexo", "genero"] },
      { key: "tipo_deficiencia", label: "Tipo de Deficiência", aliases: ["tipo_deficiencia", "pcd_tipo"] },
      {
        key: "frequencia",
        label: "Frequência Obtida na Turma",
        aliases: ["frequencia", "frequencia_percentual", "percentual_frequencia"],
        type: "pct01",
      },
    ],
  },
  {
    grupo: "DADOS DE ADERÊNCIA AO PERFIL PRIORITÁRIO",
    cols: Array.from({ length: 21 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return { key: `ps_${n}`, label: `PS-${n}`, aliases: [`ps_${n}`, `ps${n}`] };
    }),
  },
];

const RELATORIOS: RelatorioDef[] = [
  {
    view: "vw_cronograma_execucao",
    titulo: "Cronograma de Execução (formato MTE)",
    descricao: "Cronograma físico-financeiro no padrão MTE com cabeçalho de dois níveis.",
    arquivo: "cronograma-execucao-mte.xlsx",
    cabecalhoDuplo: true,
  },
  {
    view: "vw_cursos_executados",
    titulo: "Cursos Executados",
    descricao:
      "Layout oficial MODELO_Cursos Executados.xlsx: Executora, curso, turma, turno, horário, CH (Gerais/Específico/Total), dias, período, município, vagas, matriculadas, evadidas.",
    arquivo: "cursos-executados.xlsx",
    deqItem: "DEQ — Item IV",
    variant: "cursos_executados",
  },
  {
    view: "vw_beneficiarias",
    titulo: "Beneficiárias",
    descricao:
      "Nome, CPF, nascimento, gênero, raça/cor, PCD, curso, turma, CH e conclusão. Campos vazios permanecem em branco.",
    arquivo: "beneficiarias.xlsx",
    deqItem: "DEQ — Item V",
  },
  {
    view: "vw_consolidacao_turma",
    titulo: "Consolidação por Turma",
    descricao:
      "Matriculadas, % frequência média, lanches, transporte, kit, material, camiseta e certificados por turma.",
    arquivo: "consolidacao-turma.xlsx",
    deqItem: "DEQ — Item VI",
  },
  {
    view: "vw_checklist_fiscalizacao",
    titulo: "Checklist de Fiscalização (Identificação PMQ)",
    descricao:
      "Evidências de identificação do PMQ nas turmas/atividades — verificação exigida pela fiscalização MTE.",
    arquivo: "checklist-fiscalizacao-pmq.xlsx",
    deqItem: "DEQ — Item VII",
  },
  {
    view: "vw_relacao_qualificados",
    titulo: "Relação de Qualificados (oficial)",
    descricao:
      "Layout oficial MTE com bloco de identificação do instrumento e frequência em decimal 0–1.",
    arquivo: "relacao-qualificados.xlsx",
    variant: "relacao_qualificados",
  },
  {
    view: "vw_relacao_qualificados",
    titulo: "Relação Final de Qualificados (SINE/MTE)",
    descricao:
      "Layout final oficial: cabeçalho institucional + grupos DADOS DA QUALIFICAÇÃO / BENEFICIÁRIO / ADERÊNCIA (PS-01…PS-21).",
    arquivo: "relacao-final-qualificados.xlsx",
    variant: "relacao_final_qualificados",
  },
  {
    view: "execucao_fisico_financeira",
    titulo: "Execução Físico-Financeira por Rubrica",
    descricao: "Previsto, executado, saldo e % por rubrica TransfereGov.",
    arquivo: "execucao-fisico-financeira.xlsx",
    variant: "execucao_ff",
  },
];

export const Route = createFileRoute("/_authenticated/relatorios/mte")({
  component: RelatoriosMte,
});

function exportarXLSX(
  rows: Record<string, unknown>[],
  nome: string,
  sheetName: string,
  opts: { cabecalhoDuplo?: boolean; variant?: RelatorioDef["variant"] } = {},
) {
  if (!rows.length) {
    toast.warning("Nenhum dado retornado pela view.");
    return;
  }
  const wb = XLSX.utils.book_new();

  if (opts.variant === "relacao_qualificados") {
    const cols = Object.keys(rows[0] ?? {});
    const cabecalho = [
      ["RELAÇÃO DE QUALIFICADOS", ...Array(Math.max(0, cols.length - 1)).fill("")],
      [`Modalidade: ${INSTRUMENTO.modalidade}`],
      [`Entidade Executora: ${INSTRUMENTO.executora}`],
      [`Nº TransfereGov: ${INSTRUMENTO.transferegov}`],
      [`NUP/SEI: ${INSTRUMENTO.nup_sei}`],
      [""],
      cols,
      ...rows.map((r) =>
        cols.map((c) => {
          const v = r[c];
          // frequência esperada como decimal 0-1
          if (/frequen/i.test(c) && typeof v === "number") return v <= 1 ? v : v / 100;
          return v ?? "";
        }),
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(cabecalho);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, cols.length - 1) } }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  } else if (opts.variant === "execucao_ff") {
    const cols = ["codigo", "descricao", "valor_previsto", "valor_executado", "saldo", "pct_execucao"];
    const header = ["Código", "Descrição", "Previsto (R$)", "Executado (R$)", "Saldo (R$)", "% Execução"];
    const totalPrev = rows.reduce((s, r) => s + Number(r.valor_previsto ?? 0), 0);
    const totalExec = rows.reduce((s, r) => s + Number(r.valor_executado ?? 0), 0);
    const aoa = [
      ["EXECUÇÃO FÍSICO-FINANCEIRA POR RUBRICA", ...Array(cols.length - 1).fill("")],
      [`Executora: ${INSTRUMENTO.executora} — TransfereGov ${INSTRUMENTO.transferegov}`],
      [""],
      header,
      ...rows.map((r) => cols.map((c) => r[c] ?? "")),
      [
        "TOTAL",
        "",
        totalPrev,
        totalExec,
        totalPrev - totalExec,
        totalPrev > 0 ? Math.round((totalExec / totalPrev) * 10000) / 100 : 0,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  } else if (opts.cabecalhoDuplo) {
    // Insere linha superior mesclada como cabeçalho de 1º nível
    const cols = Object.keys(rows[0] ?? {});
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Cronograma Físico-Financeiro de Execução (MTE)", ...Array(cols.length - 1).fill("")],
      cols,
      ...rows.map((r) => cols.map((c) => r[c])),
    ]);
    ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, cols.length - 1) } }];
    XLSX.utils.book_append_sheet(wb, ws2, sheetName.slice(0, 31));
  } else if (opts.variant === "cursos_executados") {
    const nc = CURSOS_EXECUTADOS_COLS.length;
    // Linha 1: título; linha 2: grupos (CH / Período mesclado); linha 3: rótulos
    const linhaGrupos: string[] = [];
    CURSOS_EXECUTADOS_COLS.forEach((c) => {
      if (c.group === "CH") linhaGrupos.push(linhaGrupos.length && linhaGrupos[linhaGrupos.length - 1] === "Carga Horária" ? "" : "Carga Horária");
      else if (c.group === "PERIODO") linhaGrupos.push(linhaGrupos.length && linhaGrupos[linhaGrupos.length - 1] === "Período de Realização" ? "" : "Período de Realização");
      else linhaGrupos.push("");
    });
    const cabecalho = [
      [CABECALHO_CURSOS_EXECUTADOS, ...Array(nc - 1).fill("")],
      linhaGrupos,
      CURSOS_EXECUTADOS_COLS.map((c) => c.label),
      ...rows.map((r) =>
        CURSOS_EXECUTADOS_COLS.map((c) => pegar(r as Record<string, unknown>, c.key)),
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(cabecalho);
    const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nc - 1 } }];
    // Merge grupos CH / PERIODO
    const chStart = CURSOS_EXECUTADOS_COLS.findIndex((c) => c.group === "CH");
    const chEnd = CURSOS_EXECUTADOS_COLS.map((c, i) => (c.group === "CH" ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    if (chStart >= 0 && chEnd > chStart) merges.push({ s: { r: 1, c: chStart }, e: { r: 1, c: chEnd } });
    const pStart = CURSOS_EXECUTADOS_COLS.findIndex((c) => c.group === "PERIODO");
    const pEnd = CURSOS_EXECUTADOS_COLS.map((c, i) => (c.group === "PERIODO" ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    if (pStart >= 0 && pEnd > pStart) merges.push({ s: { r: 1, c: pStart }, e: { r: 1, c: pEnd } });
    ws["!merges"] = merges;
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  } else if (opts.variant === "relacao_final_qualificados") {
    const allCols = REL_FINAL_GROUPS.flatMap((g) => g.cols);
    const nc = allCols.length;
    const linhaCab = [
      "RELAÇÃO FINAL DE QUALIFICADOS",
      ...Array(nc - 1).fill(""),
    ];
    const info = [
      [`Modalidade de Instrumento: ${INSTRUMENTO.modalidade}`],
      [`CNPJ e Nome da Executora: ${INSTRUMENTO.executora}`],
      [`Nº do Instrumento (TransfereGov): ${INSTRUMENTO.transferegov}`],
      [`NUP/SEI/MTE: ${INSTRUMENTO.nup_sei}`],
      [`Início da Vigência: —`],
      [`Fim da Vigência: —`],
      [`Meta de Qualificados: —`],
      [],
    ];
    const linhaGrupos: string[] = [];
    for (const g of REL_FINAL_GROUPS) {
      linhaGrupos.push(g.grupo);
      for (let i = 1; i < g.cols.length; i += 1) linhaGrupos.push("");
    }
    const linhaLabels = allCols.map((c) => c.label);
    const dataRows = rows.map((r, idx) => {
      const rec = r as Record<string, unknown>;
      return allCols.map((c) => {
        if (c.key === "ordem") return idx + 1;
        const aliases = c.aliases ?? [c.key];
        let val: unknown = "";
        for (const a of aliases) {
          if (a in rec && rec[a] != null && rec[a] !== "") {
            val = rec[a];
            break;
          }
        }
        // PS-XX: SIM/NÃO
        if (c.key.startsWith("ps_")) {
          if (val === true || String(val).toLowerCase() === "sim") return "SIM";
          if (val === false || String(val).toLowerCase() === "não" || String(val).toLowerCase() === "nao") return "NÃO";
          return "NÃO";
        }
        if (c.type === "pct01" && typeof val === "number") {
          return val <= 1 ? val : val / 100;
        }
        if (c.key === "idade" && !val) {
          // Calcular a partir de data_nascimento se houver
          const dn = rec.data_nascimento ?? rec.nascimento;
          if (dn) {
            const dt = new Date(String(dn));
            if (!Number.isNaN(dt.getTime())) {
              const now = new Date();
              let age = now.getFullYear() - dt.getFullYear();
              const m = now.getMonth() - dt.getMonth();
              if (m < 0 || (m === 0 && now.getDate() < dt.getDate())) age -= 1;
              return age;
            }
          }
          return "";
        }
        return val ?? "";
      });
    });
    const aoa = [linhaCab, ...info, linhaGrupos, linhaLabels, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nc - 1 } }];
    // Merge dos grupos na linha de grupos (linhaGrupos index = 1 + info.length)
    let col = 0;
    const grupoRow = 1 + info.length;
    for (const g of REL_FINAL_GROUPS) {
      if (g.cols.length > 1) {
        merges.push({ s: { r: grupoRow, c: col }, e: { r: grupoRow, c: col + g.cols.length - 1 } });
      }
      col += g.cols.length;
    }
    ws["!merges"] = merges;
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  } else {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }

  XLSX.writeFile(wb, nome);
}

function RelatoriosMte() {
  const [loading, setLoading] = useState<string | null>(null);
  const [erro, setErro] = useState<Record<string, string>>({});
  const [detalhadaOpen, setDetalhadaOpen] = useState(false);

  async function baixar(def: RelatorioDef) {
    setLoading(def.view);
    setErro((e) => ({ ...e, [def.view]: "" }));
    try {
      const res =
        def.variant === "execucao_ff"
          ? await consultarExecucaoFisicoFinanceira()
          : await consultarViewMTE({ data: { view: def.view as never } });
      if (res.error) {
        setErro((e) => ({ ...e, [def.view]: res.error! }));
        toast.error(`View ${def.view} indisponível: ${res.error}`);
        return;
      }
      const rows = JSON.parse(res.rowsJson || "[]") as Record<string, unknown>[];
      exportarXLSX(rows, def.arquivo, def.titulo, {
        cabecalhoDuplo: def.cabecalhoDuplo,
        variant: def.variant,
      });
      toast.success(`Relatório "${def.titulo}" exportado.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro((s) => ({ ...s, [def.view]: msg }));
      toast.error(msg);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Relatórios MTE"
        description="Exports XLSX no padrão exigido pela fiscalização MTE / TransfereGov."
      />
      <div className="mb-6">
        <ComprovacaoTurmaCard />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setDetalhadaOpen(true)}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          Lista Detalhada por turma (XLSX 3 abas)
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {RELATORIOS.map((r) => (
          <div key={`${r.view}::${r.variant ?? ""}`} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{r.titulo}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.descricao}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {r.deqItem ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                      {r.deqItem}
                    </span>
                  ) : null}
                  <span className="font-mono">{r.view}</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => baixar(r)}
              disabled={loading === `${r.view}::${r.variant ?? ""}`}
            >
              {loading === `${r.view}::${r.variant ?? ""}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Baixar XLSX
            </Button>
            {erro[`${r.view}::${r.variant ?? ""}`] ? (
              <div className="flex items-start gap-1.5 rounded border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-words">{erro[`${r.view}::${r.variant ?? ""}`]}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <DialogListaDetalhada open={detalhadaOpen} onOpenChange={setDetalhadaOpen} />
    </div>
  );
}
