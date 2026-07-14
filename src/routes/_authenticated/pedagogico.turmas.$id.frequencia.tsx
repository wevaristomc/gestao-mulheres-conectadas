import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCheck, FileCheck2, Info, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  aulasByTurmaOptions, cursistasByTurmaOptions, frequenciaByTurmaOptions,
  upsertFrequencia, upsertFrequenciaBatch, pickFirst, formatarData, evidenciasCountByTurmaOptions,
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
  const [fechandoAula, setFechandoAula] = useState<Row | null>(null);

  const aulas = useMemo(
    () =>
      [...(aulasQ.data?.rows ?? [])].sort((a, b) =>
        String(a.data ?? "").localeCompare(String(b.data ?? "")),
      ),
    [aulasQ.data?.rows],
  );
  const cursistasRaw = cursistasQ.data?.rows ?? [];
  const tableName = freqQ.data?.tableName ?? null;
  const freqIndex = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of freqQ.data?.rows ?? []) {
      map.set(`${r.aula_id}:${r.matricula_id}`, !!r.presente);
    }
    return map;
  }, [freqQ.data?.rows]);

  type SortMode = "nome-asc" | "nome-desc" | "freq-desc" | "freq-asc";
  const [sortMode, setSortMode] = useState<SortMode>("nome-asc");

  const pctByMatricula = useMemo(() => {
    const m = new Map<string, number>();
    if (aulas.length === 0) return m;
    for (const c of cursistasRaw) {
      let p = 0;
      for (const a of aulas) if (freqIndex.get(`${a.id}:${c.id}`)) p += 1;
      m.set(c.id, (p / aulas.length) * 100);
    }
    return m;
  }, [cursistasRaw, aulas, freqIndex]);

  const cursistas = useMemo(() => {
    const rows = [...cursistasRaw];
    rows.sort((a, b) => {
      if (sortMode === "nome-asc") return nomeCursista(a).localeCompare(nomeCursista(b), "pt-BR", { sensitivity: "base" });
      if (sortMode === "nome-desc") return nomeCursista(b).localeCompare(nomeCursista(a), "pt-BR", { sensitivity: "base" });
      const pa = pctByMatricula.get(a.id) ?? 0;
      const pb = pctByMatricula.get(b.id) ?? 0;
      return sortMode === "freq-desc" ? pb - pa : pa - pb;
    });
    return rows;
  }, [cursistasRaw, sortMode, pctByMatricula]);

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
      qc.invalidateQueries({ queryKey: ["mte", "presencas"] });
      qc.invalidateQueries({ queryKey: ["mte", "matriculas"] });
      qc.invalidateQueries({ queryKey: ["relatorios"] });
    },
  });

  const fecharChamada = useMutation({
    mutationFn: async (aulaId: string) => {
      const naoMarcados = cursistasRaw
        .filter((c) => !freqIndex.has(`${aulaId}:${c.id}`))
        .map<FrequenciaRow>((c) => ({
          aula_id: aulaId,
          matricula_id: c.id,
          presente: false,
        }));
      await upsertFrequenciaBatch(naoMarcados);
      return naoMarcados;
    },
    onMutate: async (aulaId) => {
      await qc.cancelQueries({ queryKey: ["pedagogico", "frequencia", turmaId] });
      const prev = qc.getQueryData<FreqCache>(["pedagogico", "frequencia", turmaId]);
      if (prev) {
        const existing = new Set(prev.rows.map((r) => `${r.aula_id}:${r.matricula_id}`));
        const additions: FrequenciaRow[] = cursistasRaw
          .filter((c) => !existing.has(`${aulaId}:${c.id}`))
          .map((c) => ({ aula_id: aulaId, matricula_id: c.id, presente: false }));
        qc.setQueryData<FreqCache>(["pedagogico", "frequencia", turmaId], {
          ...prev,
          rows: [...prev.rows, ...additions],
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pedagogico", "frequencia", turmaId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (rows) => {
      toast.success(
        rows.length === 0
          ? "Chamada já estava completa."
          : `${rows.length} cursista(s) marcada(s) como falta.`,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pedagogico", "frequencia", turmaId] });
      qc.invalidateQueries({ queryKey: ["mte", "presencas"] });
      qc.invalidateQueries({ queryKey: ["mte", "matriculas"] });
      qc.invalidateQueries({ queryKey: ["relatorios"] });
    },
  });

  const naoMarcadosPorAula = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of aulas) {
      let n = 0;
      for (const c of cursistasRaw) if (!freqIndex.has(`${a.id}:${c.id}`)) n += 1;
      m.set(a.id, n);
    }
    return m;
  }, [aulas, cursistasRaw, freqIndex]);

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
  const pendentesMobile = aulaMobileSel ? naoMarcadosPorAula.get(aulaMobileSel.id) ?? 0 : 0;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Ordenar:</span>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome-asc">Nome (A → Z)</SelectItem>
            <SelectItem value="nome-desc">Nome (Z → A)</SelectItem>
            <SelectItem value="freq-desc">Frequência (maior → menor)</SelectItem>
            <SelectItem value="freq-asc">Frequência (menor → maior)</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setComprovando(aulaMobileSel)}
                className="inline-flex items-center gap-1 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted"
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={pendentesMobile === 0 || fecharChamada.isPending}
                onClick={() => setFechandoAula(aulaMobileSel)}
                title="Marcar não marcados como falta"
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Fechar chamada
                {pendentesMobile > 0 ? ` (${pendentesMobile})` : ""}
              </Button>
            </div>
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
      <div className="hidden min-w-0 w-full max-w-full overflow-x-auto rounded-md border md:block">
      <Table className="min-w-max">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background min-w-[220px]">Cursista</TableHead>
            {aulas.map((a) => (
              <TableHead key={a.id} className="text-center whitespace-nowrap">
                <div className="text-xs font-medium">{formatarData(pickFirst(a, ["data"]))}</div>
                <div className="text-[10px] font-normal text-muted-foreground truncate max-w-[120px]">
                  {pickFirst(a, ["titulo", "tema", "assunto"]) ?? ""}
                </div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => setComprovando(a)}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-normal text-muted-foreground hover:bg-muted"
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
                  <button
                    type="button"
                    onClick={() => setFechandoAula(a)}
                    disabled={(naoMarcadosPorAula.get(a.id) ?? 0) === 0 || fecharChamada.isPending}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-normal text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
                    title="Marcar não marcados como falta"
                  >
                    <CheckCheck className="h-3 w-3" />
                    <span>fechar</span>
                    {(naoMarcadosPorAula.get(a.id) ?? 0) > 0 ? (
                      <span className="text-amber-700">({naoMarcadosPorAula.get(a.id)})</span>
                    ) : null}
                  </button>
                </div>
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

      <AlertDialog
        open={!!fechandoAula}
        onOpenChange={(o) => !o && setFechandoAula(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar chamada desta aula?</AlertDialogTitle>
            <AlertDialogDescription>
              {fechandoAula ? (
                <>
                  Aula de{" "}
                  <strong>{formatarData(pickFirst(fechandoAula, ["data"]))}</strong>.
                  Todas as cursistas que ainda não foram lançadas serão marcadas
                  como <strong>falta</strong>. Isso pode ser corrigido depois
                  desmarcando individualmente.
                  <br />
                  <br />
                  <strong>
                    {naoMarcadosPorAula.get(fechandoAula.id) ?? 0}
                  </strong>{" "}
                  cursista(s) serão marcadas como falta.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (fechandoAula) {
                  fecharChamada.mutate(fechandoAula.id);
                  setFechandoAula(null);
                }
              }}
            >
              Fechar chamada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}