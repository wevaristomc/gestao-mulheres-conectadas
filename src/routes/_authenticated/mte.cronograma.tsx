import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cronogramaGeralOptions, turmasMteListOptions } from "@/lib/mte-queries";
import { downloadCSV, toCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/mte/cronograma")({
  component: CronogramaIndex,
});

function CronogramaIndex() {
  const turmasQ = useQuery(turmasMteListOptions());
  const q = useQuery(cronogramaGeralOptions());

  const [turmaFiltro, setTurmaFiltro] = useState<string>("__all__");
  const [de, setDe] = useState<string>("");
  const [ate, setAte] = useState<string>("");

  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    return all.filter((r) => {
      if (turmaFiltro !== "__all__" && r.turma_id !== turmaFiltro) return false;
      if (de && (r.data ?? "") < de) return false;
      if (ate && (r.data ?? "") > ate) return false;
      return true;
    });
  }, [q.data, turmaFiltro, de, ate]);

  const grupos = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.data ?? "sem-data";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const totais = useMemo(() => {
    let prev = 0, min = 0;
    for (const r of rows) {
      prev += Number(r.ch_prevista ?? 0) || 0;
      min += Number(r.ch_ministrada ?? 0) || 0;
    }
    return { prev, min, count: rows.length };
  }, [rows]);

  const onExport = () => {
    const csv = toCSV(
      rows.map((r) => ({
        data: r.data ?? "",
        turma: (r.turma?.codigo_turma ?? "") + " - " + (r.turma?.nome_curso ?? ""),
        municipio: r.turma?.municipio ?? "",
        turno: r.turma?.turno ?? "",
        hora_inicio: r.hora_inicio ?? "",
        hora_fim: r.hora_fim ?? "",
        ch_prevista: r.ch_prevista ?? "",
        ch_ministrada: r.ch_ministrada ?? "",
        tipo_ch: r.tipo_ch ?? "",
        conteudo: r.conteudo_programatico ?? "",
        instrutor: r.instrutor ?? "",
      })),
      ["data", "turma", "municipio", "turno", "hora_inicio", "hora_fim", "ch_prevista", "ch_ministrada", "tipo_ch", "conteudo", "instrutor"],
    );
    downloadCSV(`cronograma-mte-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div>
      <PageHeader
        title="Cronograma consolidado"
        description="Todas as aulas ordenadas por data — visão MTE para fiscalização."
        actions={
          <Button size="sm" variant="outline" onClick={onExport} disabled={!rows.length}>
            <Download className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Turma</Label>
          <Select value={turmaFiltro} onValueChange={setTurmaFiltro}>
            <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {(turmasQ.data?.rows ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{(t.codigo_turma ?? "?")} — {t.nome_curso ?? "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-4 text-xs">
          <Counter label="Aulas" value={String(totais.count)} />
          <Counter label="CH prev." value={`${totais.prev}h`} />
          <Counter label="CH min." value={`${totais.min}h`} />
        </div>
      </div>

      {q.data?.error ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{q.data.error}</div>
      ) : null}

      {q.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-md border py-12 text-center text-sm text-muted-foreground">
          Nenhuma aula no período selecionado.
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([data, itens]) => (
            <section key={data}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                {data === "sem-data" ? "Sem data definida" : new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
              </h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Horário</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Município</TableHead>
                      <TableHead className="w-20 text-center">CH</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Conteúdo</TableHead>
                      <TableHead>Instrutor(a)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.hora_inicio ?? "—"}{r.hora_fim ? ` – ${r.hora_fim}` : ""}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium">{r.turma?.codigo_turma ?? "?"}</div>
                          <div className="text-xs text-muted-foreground">{r.turma?.nome_curso ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.turma?.municipio ?? "—"}</TableCell>
                        <TableCell className="text-center text-sm">{r.ch_ministrada ?? r.ch_prevista ?? "—"}</TableCell>
                        <TableCell>{r.tipo_ch ? <Badge variant="secondary" className="capitalize">{r.tipo_ch}</Badge> : "—"}</TableCell>
                        <TableCell className="max-w-md truncate text-sm" title={r.conteudo_programatico ?? ""}>{r.conteudo_programatico ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.instrutor ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-md border px-3 py-1">
      <span className="text-lg font-semibold">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}