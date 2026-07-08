import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { consultarViewMTE, consultarExecucaoFisicoFinanceira } from "@/lib/mte-relatorios.functions";

type RelatorioDef = {
  view:
    | "vw_cronograma_execucao"
    | "vw_cursos_executados"
    | "vw_beneficiarias"
    | "vw_consolidacao_turma"
    | "vw_relacao_qualificados"
    | "execucao_fisico_financeira";
  titulo: string;
  descricao: string;
  arquivo: string;
  cabecalhoDuplo?: boolean;
  variant?: "relacao_qualificados" | "execucao_ff";
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
      "Município, curso, turma, turno, público-alvo, carga horária, vagas registradas, inscritas/matriculadas, concluintes, evadidas.",
    arquivo: "cursos-executados.xlsx",
    deqItem: "DEQ — Item IV",
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
    view: "vw_relacao_qualificados",
    titulo: "Relação de Qualificados (oficial)",
    descricao:
      "Layout oficial MTE com bloco de identificação do instrumento e frequência em decimal 0–1.",
    arquivo: "relacao-qualificados.xlsx",
    variant: "relacao_qualificados",
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
  } else {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  }

  XLSX.writeFile(wb, nome);
}

function RelatoriosMte() {
  const [loading, setLoading] = useState<string | null>(null);
  const [erro, setErro] = useState<Record<string, string>>({});

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
      <div className="grid gap-3 md:grid-cols-2">
        {RELATORIOS.map((r) => (
          <div key={r.view} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{r.titulo}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.descricao}</div>
                <div className="text-[10px] text-muted-foreground mt-1 font-mono">{r.view}</div>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => baixar(r)}
              disabled={loading === r.view}
            >
              {loading === r.view ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar XLSX
            </Button>
            {erro[r.view] ? (
              <div className="flex items-start gap-1.5 rounded border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-words">{erro[r.view]}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
