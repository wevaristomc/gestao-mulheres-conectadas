import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FileCheck2, Info, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  aulasByTurmaOptions, cursistasByTurmaOptions, frequenciaByTurmaOptions,
  upsertFrequencia, pickFirst, formatarData, evidenciasCountByTurmaOptions,
  turmaByIdOptions, type FrequenciaRow, type Row,
} from "@/lib/pedagogico-queries";
import { AulaComprovacaoDialog } from "@/components/pedagogico/aula-comprovacao-dialog";

export const Route = createFileRoute("/_authenticated/pedagogico/turmas/$id/frequencia")({
  component: FrequenciaTab,
});

function nomeCursista(matricula: Row): string {
  const cursista = matricula.cursistas as Row | null | undefined;
  return (
    pickFirst(cursista ?? null, ["nome", "nome_completo", "email"]) ??
    pickFirst(matricula, ["nome", "email"]) ??
    (matricula.cursista_id as string) ??
    matricula.id
  );
}

type FreqCache = { tableName: string | null; rows: FrequenciaRow[]; error?: string };

function FrequenciaTab() {
  const { id: turmaId } = Route.useParams();
  const qc = useQueryClient();

  const aulasQ = useQuery(aulasByTurmaOptions(turmaId));
  const cursistasQ = useQuery(cursistasByTurmaOptions(turmaId));
  const freqQ = useQuery(frequenciaByTurmaOptions(turmaId));
  const countQ = useQuery(evidenciasCountByTurmaOptions(turmaId));
  const turmaQ = useQuery(turmaByIdOptions(turmaId));
  const codigoTurma = (pickFirst(turmaQ.data?.row, ["codigo_turma"]) ?? null) as string | null;
  const countByAula = countQ.data?.byAula ?? {};

  const [comprovando, setComprovando] = useState<Row | null>(null);
  const [aulaMobile, setAulaMobile] = useState<string | null>(null);

  const aulas = useMemo(
    () =>
      [...(aulasQ.data?.rows ?? [])].sort((a, b) =>
        String(a.data ?? "").localeCompare(String(b.data ?? "")),
      ),
    [aulasQ.data?.rows],
  );
  const cursistas = cursistasQ.data?.rows ?? [];
  const tableName = freqQ.data?.tableName ?? null;
  const freqIndex = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of freqQ.data?.rows ?? []) {
      map.set(`${r.aula_id}:${r.matricula_id}`, !!r.presente);
    }
    return map;
  }, [freqQ.data?.rows]);

  const marcar = useMutation({
    mutationFn: (v: FrequenciaRow) => upsertFrequencia(v),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["pedagogico", "frequencia", turmaId] });
      const prev = qc.getQueryData<FreqCache>(["pedagogico", "frequencia", turmaId]);
      if (prev) {
        const idx = prev.rows.findIndex(
          (r) => r.aula_id === v.aula_id && r.matricula_id === v.matricula_id,
        );
        const nextRows =
          idx >= 0
            ? prev.rows.map((r, i) => (i === idx ? { ...r, presente: v.presente } : r))
            : [...prev.rows, v];
        qc.setQueryData<FreqCache>(["pedagogico", "frequencia", turmaId], { ...prev, rows: nextRows });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pedagogico", "frequencia", turmaId], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pedagogico", "frequencia", turmaId] });
    },
  });

  const loading = aulasQ.isLoading || cursistasQ.isLoading || freqQ.isLoading;
  const erro =
    aulasQ.data?.error ||
    cursistasQ.data?.error ||
    freqQ.data?.error ||
    (aulasQ.isError ? String(aulasQ.error) : null) ||
    (cursistasQ.isError ? String(cursistasQ.error) : null);

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (erro) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">Falha ao ler dados</div>
          <div className="text-xs opacity-80">{erro}</div>
        </div>
      </div>
    );
  }

  if (!tableName) {
    return (
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <div className="font-medium">Tabela de frequência não encontrada no banco</div>
          <div className="text-xs text-muted-foreground">
            Configure <code>frequencias(aula_id, matricula_id, presente)</code> (ou <code>presencas</code>) para habilitar esta grade.
          </div>
        </div>
      </div>
    );
  }

  if (aulas.length === 0) {
    return (
      <div className="rounded-md border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
        Cadastre aulas na aba "Aulas" para começar a marcar frequência.
      </div>
    );
  }

  if (cursistas.length === 0) {
    return (
      <div className="rounded-md border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
        Nenhuma cursista matriculada nesta turma.
      </div>
    );
  }

  const aulaMobileSelId =
    aulaMobile ?? (aulas[0]?.id as string | undefined) ?? null;
  const aulaMobileSel = aulas.find((a) => a.id === aulaMobileSelId) ?? aulas[0];

  return (
    <div className="space-y-3">
      {/* Mobile: chooser + vertical list with big P/F toggles */}
      <div className="rounded-md border md:hidden">
        <div className="border-b p-2">
          <label className="text-xs font-medium text-muted-foreground">Aula</label>
          <select
            className="mt-1 block w-full rounded-md border bg-background px-2 py-2 text-sm"
            value={aulaMobileSel?.id ?? ""}
            onChange={(e) => setAulaMobile(e.target.value)}
          >
            {aulas.map((a) => (
              <option key={a.id} value={a.id}>
                {formatarData(pickFirst(a, ["data"]))} — {String(pickFirst(a, ["titulo", "tema", "assunto"]) ?? "Aula")}
              </option>
            ))}
          </select>
          {aulaMobileSel ? (
            <button
              type="button"
              onClick={() => setComprovando(aulaMobileSel)}
              className="mt-2 inline-flex items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {(countByAula[aulaMobileSel.id] ?? 0) > 0 ? (
                <>
                  <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">{countByAula[aulaMobileSel.id]} evidência(s)</span>
                </>
              ) : (
                <>
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>Anexar comprovação</span>
                </>
              )}
            </button>
          ) : null}
        </div>
        <ul className="divide-y">
          {cursistas.map((m) => {
            const key = `${aulaMobileSel?.id}:${m.id}`;
            const presente = aulaMobileSel ? (freqIndex.get(key) ?? false) : false;
            return (
              <li key={m.id} className="flex min-w-0 items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1 break-words text-sm font-medium">
                  {nomeCursista(m)}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={presente ? "default" : "outline"}
                    className="h-10 min-w-12 px-3"
                    disabled={!aulaMobileSel || marcar.isPending}
                    onClick={() =>
                      aulaMobileSel &&
                      marcar.mutate({
                        aula_id: aulaMobileSel.id,
                        matricula_id: m.id,
                        presente: true,
                      })
                    }
                  >
                    P
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!presente ? "secondary" : "outline"}
                    className="h-10 min-w-12 px-3"
                    disabled={!aulaMobileSel || marcar.isPending}
                    onClick={() =>
                      aulaMobileSel &&
                      marcar.mutate({
                        aula_id: aulaMobileSel.id,
                        matricula_id: m.id,
                        presente: false,
                      })
                    }
                  >
                    F
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Desktop / tablet: matrix table with sticky name column */}
      <div className="hidden rounded-md border overflow-auto md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background min-w-[220px]">Cursista</TableHead>
            {aulas.map((a) => (
              <TableHead key={a.id} className="text-center whitespace-nowrap">
                <div className="text-xs font-medium">{formatarData(pickFirst(a, ["data"]))}</div>
                <div className="text-[10px] font-normal text-muted-foreground truncate max-w-[120px]">
                  {pickFirst(a, ["titulo", "tema", "assunto"]) ?? ""}
                </div>
                <button
                  type="button"
                  onClick={() => setComprovando(a)}
                  className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-normal text-muted-foreground hover:bg-muted"
                  title="Comprovação da aula"
                >
                  {(countByAula[a.id] ?? 0) > 0 ? (
                    <>
                      <FileCheck2 className="h-3 w-3 text-emerald-600" />
                      <span className="text-emerald-700">{countByAula[a.id]}</span>
                    </>
                  ) : (
                    <>
                      <Paperclip className="h-3 w-3" />
                      <span>anexar</span>
                    </>
                  )}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cursistas.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="sticky left-0 z-10 bg-background font-medium">
                {nomeCursista(m)}
              </TableCell>
              {aulas.map((a) => {
                const key = `${a.id}:${m.id}`;
                const presente = freqIndex.get(key) ?? false;
                return (
                  <TableCell key={a.id} className="text-center">
                    <Checkbox
                      checked={presente}
                      disabled={marcar.isPending}
                      onCheckedChange={(v) =>
                        marcar.mutate({
                          aula_id: a.id,
                          matricula_id: m.id,
                          presente: v === true,
                        })
                      }
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {comprovando ? (
        <AulaComprovacaoDialog
          open={!!comprovando}
          onOpenChange={(o) => !o && setComprovando(null)}
          turmaId={turmaId}
          aulaId={comprovando.id}
          codigoTurma={codigoTurma}
          dataAula={pickFirst(comprovando, ["data"])}
        />
      ) : null}
    </div>
  );
}