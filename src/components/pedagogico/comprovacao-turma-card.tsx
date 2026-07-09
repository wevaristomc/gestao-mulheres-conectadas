import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { evidenciaTemPmq } from "@/lib/pedagogico-queries";
import { turmasMteListOptions } from "@/lib/mte-queries";

type CoberturaTurma = {
  turma_id: string;
  codigo_turma: string;
  nome_curso: string | null;
  total_aulas: number;
  aulas_comprovadas: number;
  pct: number;
};

type EvidenciaRow = {
  id: string;
  turma_id: string | null;
  aula_id: string | null;
  tipo: string;
  descricao: string | null;
  arquivo_nome: string | null;
  created_at?: string | null;
};

type AulaLite = { id: string; turma_id: string; data: string | null };

function comprovacaoQuery() {
  return {
    queryKey: ["relatorios", "comprovacao"],
    queryFn: async (): Promise<{
      cobertura: CoberturaTurma[];
      evidencias: EvidenciaRow[];
      aulas: Record<string, AulaLite>;
      error?: string;
    }> => {
      const [turmasRes, aulasRes, evsRes] = await Promise.all([
        supabase.from("turmas").select("id, codigo_turma, nome_curso"),
        supabase.from("aulas").select("id, turma_id, data"),
        supabase.from("evidencias").select("id, turma_id, aula_id, tipo, descricao, arquivo_nome, created_at"),
      ]);
      if (turmasRes.error) return { cobertura: [], evidencias: [], aulas: {}, error: turmasRes.error.message };
      if (aulasRes.error) return { cobertura: [], evidencias: [], aulas: {}, error: aulasRes.error.message };
      if (evsRes.error) return { cobertura: [], evidencias: [], aulas: {}, error: evsRes.error.message };

      const turmas = (turmasRes.data ?? []) as {
        id: string; codigo_turma: string | null; nome_curso: string | null;
      }[];
      const aulas = (aulasRes.data ?? []) as AulaLite[];
      const evs = (evsRes.data ?? []) as EvidenciaRow[];

      const aulasById: Record<string, AulaLite> = {};
      for (const a of aulas) aulasById[a.id] = a;

      const aulasByTurma = new Map<string, string[]>();
      for (const a of aulas) {
        const arr = aulasByTurma.get(a.turma_id) ?? [];
        arr.push(a.id);
        aulasByTurma.set(a.turma_id, arr);
      }

      const aulasComListaPorTurma = new Map<string, Set<string>>();
      for (const e of evs) {
        if (e.tipo !== "lista_presenca" || !e.turma_id || !e.aula_id) continue;
        const s = aulasComListaPorTurma.get(e.turma_id) ?? new Set<string>();
        s.add(e.aula_id);
        aulasComListaPorTurma.set(e.turma_id, s);
      }

      const cobertura: CoberturaTurma[] = turmas.map((t) => {
        const total = aulasByTurma.get(t.id)?.length ?? 0;
        const comp = aulasComListaPorTurma.get(t.id)?.size ?? 0;
        return {
          turma_id: t.id,
          codigo_turma: t.codigo_turma ?? "—",
          nome_curso: t.nome_curso,
          total_aulas: total,
          aulas_comprovadas: comp,
          pct: total > 0 ? (comp / total) * 100 : 0,
        };
      });
      cobertura.sort((a, b) => a.codigo_turma.localeCompare(b.codigo_turma));

      return { cobertura, evidencias: evs, aulas: aulasById };
    },
  };
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function baixarCsv(nome: string, linhas: string[][]) {
  const csv = linhas.map((l) => l.map(csvEscape).join(";")).join("\n");
  // BOM p/ Excel abrir com acento correto
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ComprovacaoTurmaCard() {
  const q = useQuery(comprovacaoQuery());
  const turmasQ = useQuery(turmasMteListOptions());
  const [exporting, setExporting] = useState(false);

  const turmaByCod = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of turmasQ.data?.rows ?? []) map.set(t.id, t.codigo_turma ?? "—");
    return map;
  }, [turmasQ.data]);

  async function exportarCsvEvidencias() {
    if (!q.data) return;
    setExporting(true);
    try {
      const header = [
        "turma", "aula_data", "tipo", "nome_arquivo_padronizado",
        "contem_pmq", "enviado_sei", "enviado_transferegov", "criado_em",
      ];
      const linhas: string[][] = [header];
      for (const e of q.data.evidencias) {
        const aula = e.aula_id ? q.data.aulas[e.aula_id] : null;
        const codigo = e.turma_id ? (turmaByCod.get(e.turma_id) ?? "—") : "—";
        linhas.push([
          codigo,
          aula?.data ?? "",
          e.tipo,
          e.arquivo_nome ?? "",
          evidenciaTemPmq(e.descricao) ? "sim" : "nao",
          "", // enviado_sei — coluna não existe no schema atual
          "", // enviado_transferegov — coluna não existe no schema atual
          e.created_at ?? "",
        ]);
      }
      baixarCsv(`evidencias-${new Date().toISOString().slice(0, 10)}.csv`, linhas);
      toast.success(`CSV com ${q.data.evidencias.length} evidência(s) exportado.`);
    } finally {
      setExporting(false);
    }
  }

  if (q.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);
  if (erro) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{erro}</div>
      </div>
    );
  }

  const cob = q.data?.cobertura ?? [];
  const totais = cob.reduce(
    (acc, r) => {
      acc.total += r.total_aulas;
      acc.comp += r.aulas_comprovadas;
      return acc;
    },
    { total: 0, comp: 0 },
  );
  const pctGlobal = totais.total > 0 ? (totais.comp / totais.total) * 100 : 0;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-medium">Comprovação por turma</div>
            <div className="text-xs text-muted-foreground">
              Cobertura de listas de presença anexadas por aula · global {pctGlobal.toFixed(1)}%
              ({totais.comp}/{totais.total})
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={exportarCsvEvidencias} disabled={exporting}>
          {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          CSV de evidências
        </Button>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Turma</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead className="w-28 text-right">Aulas</TableHead>
              <TableHead className="w-28 text-right">Comprovadas</TableHead>
              <TableHead className="w-64">Cobertura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cob.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                  Nenhuma turma cadastrada.
                </TableCell>
              </TableRow>
            ) : cob.map((r) => (
              <TableRow key={r.turma_id}>
                <TableCell className="font-medium">{r.codigo_turma}</TableCell>
                <TableCell className="text-sm">{r.nome_curso ?? "—"}</TableCell>
                <TableCell className="text-right">{r.total_aulas}</TableCell>
                <TableCell className="text-right">{r.aulas_comprovadas}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={Math.min(100, r.pct)} className="h-2" />
                    <span className="w-14 text-right text-xs text-muted-foreground">
                      {r.pct.toFixed(1)}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}