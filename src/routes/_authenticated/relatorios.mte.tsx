import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { consultarViewMTE } from "@/lib/mte-relatorios.functions";

type RelatorioDef = {
  view:
    | "vw_cronograma_execucao"
    | "vw_cursos_executados"
    | "vw_beneficiarias"
    | "vw_consolidacao_turma";
  titulo: string;
  descricao: string;
  arquivo: string;
  cabecalhoDuplo?: boolean;
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
    descricao: "Consolidado dos cursos ofertados, cargas horárias e vagas.",
    arquivo: "cursos-executados.xlsx",
  },
  {
    view: "vw_beneficiarias",
    titulo: "Beneficiárias",
    descricao: "Cadastro completo das beneficiárias atendidas.",
    arquivo: "beneficiarias.xlsx",
  },
  {
    view: "vw_consolidacao_turma",
    titulo: "Consolidação por Turma",
    descricao: "Indicadores consolidados por turma: matrículas, frequência, evasão.",
    arquivo: "consolidacao-turma.xlsx",
  },
];

export const Route = createFileRoute("/_authenticated/relatorios/mte")({
  component: RelatoriosMte,
});

function exportarXLSX(rows: Record<string, unknown>[], nome: string, sheetName: string, cabecalhoDuplo?: boolean) {
  if (!rows.length) {
    toast.warning("Nenhum dado retornado pela view.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  if (cabecalhoDuplo) {
    // Insere linha superior mesclada como cabeçalho de 1º nível
    const cols = Object.keys(rows[0] ?? {});
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    // shift 1 linha para baixo
    const newRows: Record<string, unknown>[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowArr: Record<string, unknown> = {};
      cols.forEach((c) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c: cols.indexOf(c) })];
        rowArr[c] = cell ? cell.v : "";
      });
      newRows.push(rowArr);
    }
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Cronograma Físico-Financeiro de Execução (MTE)", ...Array(cols.length - 1).fill("")],
      cols,
      ...newRows.slice(1).map((r) => cols.map((c) => r[c])),
    ]);
    ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, cols.length - 1) } }];
    XLSX.utils.book_append_sheet(wb, ws2, sheetName.slice(0, 31));
  } else {
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
      const res = await consultarViewMTE({ data: { view: def.view } });
      if (res.error) {
        setErro((e) => ({ ...e, [def.view]: res.error! }));
        toast.error(`View ${def.view} indisponível: ${res.error}`);
        return;
      }
      const rows = JSON.parse(res.rowsJson || "[]") as Record<string, unknown>[];
      exportarXLSX(rows, def.arquivo, def.titulo, def.cabecalhoDuplo);
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
