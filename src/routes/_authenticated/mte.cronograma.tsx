import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { downloadCSV } from "@/lib/csv";
import { formatarDataBR, parseISODateLocal } from "@/lib/date-utils";
import {
  criarTurmasCiclo2Previstas,
  type ResumoCiclo2,
} from "@/lib/ciclo2-previsto.functions";
import { useEscopoTurmas } from "@/hooks/use-escopo-turmas";

export const Route = createFileRoute("/_authenticated/mte/cronograma")({
  component: CronogramaIndex,
});

function CronogramaIndex() {
  const { restrictToUserId } = useEscopoTurmas();
  const turmasQ = useQuery(turmasMteListOptions(restrictToUserId));
  const q = useQuery(cronogramaGeralOptions(restrictToUserId));
  const qc = useQueryClient();
  const criarCiclo2 = useServerFn(criarTurmasCiclo2Previstas);
  const ciclo2Mut = useMutation({
    mutationFn: async () => (await criarCiclo2()) as ResumoCiclo2,
    onSuccess: (r) => {
      toast.success(
        `Ciclo 2 previsto · ${r.turmas_criadas} nova(s), ${r.turmas_existentes} já existia(m) · ${r.aulas_placeholder_criadas} placeholder(s)`,
      );
      qc.invalidateQueries({ queryKey: ["mte"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao criar Ciclo 2"),
  });

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

  // Exporta o cronograma no formato oficial MTE (uma linha por turma).
  // Cabeçalho contém "Tipo de instrumento/parceria" e "Exercício" antes das colunas.
  const onExport = () => {
    const turmas = turmasQ.data?.rows ?? [];
    const turmasFiltradas =
      turmaFiltro === "__all__" ? turmas : turmas.filter((t) => t.id === turmaFiltro);
    const exercicio = String(new Date().getFullYear());
    const linhasMeta: string[][] = [
      ["Tipo de instrumento/parceria:", "Termo de Fomento — MROSC"],
      ["Exercício:", exercicio],
      [],
    ];
    const colunas = [
      "Executora",
      "Nome do Curso",
      "Código da Turma",
      "Turno",
      "Horário de Realização",
      "CH Conhecimentos Gerais",
      "CH Conhecimentos Específicos",
      "CH Total",
      "Quantidade de Dias de Curso",
      "Dias da Semana",
      "Nº Educ. Inscritos",
      "Período de Realização - Início",
      "Período de Realização - Fim",
      "Município",
      "Local / Endereço completo",
      "Contato Local - Nome",
      "Contato Local - Telefone",
    ];
    const dados = turmasFiltradas.map((t) => [
      t.executora ?? "QUINTA ARTE",
      t.nome_curso ?? "",
      t.codigo_turma ?? "",
      t.turno ?? "",
      t.horario_realizacao ?? "",
      String(t.ch_conhecimentos_gerais ?? ""),
      String(t.ch_conhecimentos_especificos ?? ""),
      String(t.ch_total ?? ""),
      String(t.qtd_dias_curso ?? ""),
      t.dias_semana ?? "",
      String(t.vagas ?? ""),
      formatarDataBR(t.data_inicio),
      formatarDataBR(t.data_fim),
      t.municipio ?? "",
      t.local_endereco ?? "",
      t.contato_local_nome ?? "",
      t.contato_local_telefone ?? "",
    ]);

    const escapa = (v: string) => {
      const s = String(v ?? "");
      return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      ...linhasMeta.map((l) => l.map(escapa).join(";")),
      colunas.map(escapa).join(";"),
      ...dados.map((l) => l.map(escapa).join(";")),
    ].join("\n");
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

      <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex flex-wrap items-center gap-3">
        <CalendarPlus className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-64">
          <div className="font-medium">Ciclo 2 — 6 turmas previstas (C2-01 a C2-06)</div>
          <div className="text-xs text-muted-foreground">
            Cria turmas previstas (50 vagas · 150h · Betim e Juatuba) condicionadas
            à liberação da 2ª parcela, para que o cronograma contemple as 12 turmas
            exigidas pelo Ofício 49148/2026. Idempotente.
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => ciclo2Mut.mutate()}
          disabled={ciclo2Mut.isPending}
        >
          {ciclo2Mut.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <CalendarPlus className="mr-1 h-4 w-4" />
          )}
          Adicionar Ciclo 2 previsto
        </Button>
      </div>
      {ciclo2Mut.data ? (
        <div className="mb-4 rounded-md border bg-background p-3 text-xs">
          Ciclo 2 · <strong>{ciclo2Mut.data.turmas_criadas}</strong> criada(s), <strong>{ciclo2Mut.data.turmas_existentes}</strong> já existia(m). Placeholders de aula: <strong>{ciclo2Mut.data.aulas_placeholder_criadas}</strong>.
          {ciclo2Mut.data.inconsistencias.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-amber-800">
              {ciclo2Mut.data.inconsistencias.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

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