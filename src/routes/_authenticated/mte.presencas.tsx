import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useHasRole } from "@/hooks/use-active-context";
import { formatCpf } from "@/lib/cpf";
import {
  aulasMteListOptions, matriculasListOptions, presencasByAulaOptions,
  turmasMteListOptions, upsertPresencaMTE,
} from "@/lib/mte-queries";

export const Route = createFileRoute("/_authenticated/mte/presencas")({
  component: PresencasIndex,
});

type Local = { presente: boolean; justificativa: string };

function PresencasIndex() {
  const qc = useQueryClient();
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "professor", "auxiliar_pedagogico"]);

  const { restrictToUserId } = useEscopoTurmas();
  const turmasQ = useQuery(turmasMteListOptions(restrictToUserId));
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>("");
  const effectiveTurma = turmaId || turmas[0]?.id || "";

  const aulasQ = useQuery(aulasMteListOptions(effectiveTurma || null, restrictToUserId));
  const aulas = aulasQ.data?.rows ?? [];
  const [aulaId, setAulaId] = useState<string>("");
  const effectiveAula = aulaId || aulas[0]?.id || "";

  const matQ = useQuery(matriculasListOptions(effectiveTurma || null, restrictToUserId));
  const matriculas = useMemo(() =>
    (matQ.data?.rows ?? []).filter((m) => m.status !== "evadida" && m.status !== "desistente"),
    [matQ.data],
  );

  const presQ = useQuery(presencasByAulaOptions(effectiveAula || null, restrictToUserId));

  const [local, setLocal] = useState<Record<string, Local>>({});
  useEffect(() => {
    // Reinicializa quando aula/matrículas mudam.
    const next: Record<string, Local> = {};
    for (const m of matriculas) {
      const p = (presQ.data?.rows ?? []).find((x) => x.matricula_id === m.id);
      next[m.id] = {
        presente: p ? !!p.presente : true,
        justificativa: p?.justificativa ?? "",
      };
    }
    setLocal(next);
  }, [effectiveAula, matriculas, presQ.data]);

  const totals = useMemo(() => {
    let p = 0, f = 0;
    for (const m of matriculas) {
      if (local[m.id]?.presente) p += 1; else f += 1;
    }
    return { p, f, pct: matriculas.length ? (p / matriculas.length) * 100 : 0 };
  }, [local, matriculas]);

  const save = useMutation({
    mutationFn: async () => {
      for (const m of matriculas) {
        const v = local[m.id];
        if (!v) continue;
        await upsertPresencaMTE({
          aula_id: effectiveAula,
          matricula_id: m.id,
          presente: v.presente,
          justificativa: v.presente ? null : v.justificativa || null,
        });
      }
    },
    onSuccess: () => {
      toast.success("Presenças salvas — frequência recalculada");
      qc.invalidateQueries({ queryKey: ["mte", "presencas"] });
      qc.invalidateQueries({ queryKey: ["mte", "matriculas"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar"),
  });

  return (
    <div>
      <PageHeader
        title="Presenças"
        description="Chamada por aula. A frequência das matrículas é recalculada automaticamente."
        actions={
          canWrite && effectiveAula && matriculas.length ? (
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Salvar chamada
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Turma</Label>
          <Select value={effectiveTurma} onValueChange={(v) => { setTurmaId(v); setAulaId(""); }}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder={turmas.length ? "Selecione a turma" : "Nenhuma turma"} />
            </SelectTrigger>
            <SelectContent>
              {turmas.map((t) => (
                <SelectItem key={t.id} value={t.id}>{(t.codigo_turma ?? "?")} — {t.nome_curso ?? "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Aula</Label>
          <Select value={effectiveAula} onValueChange={setAulaId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder={aulas.length ? "Selecione a aula" : "Sem aulas nesta turma"} />
            </SelectTrigger>
            <SelectContent>
              {aulas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.data ?? "s/ data"} — {a.conteudo_programatico?.slice(0, 40) ?? "(sem conteúdo)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-4 text-xs">
          <Counter label="Presentes" value={String(totals.p)} tone="green" />
          <Counter label="Faltas" value={String(totals.f)} tone={totals.f > 0 ? "red" : undefined} />
          <Counter label="% presença" value={`${totals.pct.toFixed(0)}%`} />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Beneficiária</TableHead>
              <TableHead className="w-36">CPF</TableHead>
              <TableHead className="w-32">Freq. atual</TableHead>
              <TableHead className="w-32">Presença</TableHead>
              <TableHead>Justificativa (se falta)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!effectiveAula ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Selecione turma e aula para fazer a chamada.</TableCell></TableRow>
            ) : matQ.isLoading || presQ.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>
              ))
            ) : matriculas.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Sem matrículas ativas nesta turma.</TableCell></TableRow>
            ) : matriculas.map((m) => {
              const v = local[m.id] ?? { presente: true, justificativa: "" };
              const freq = m.frequencia_percentual;
              const abaixo = typeof freq === "number" && freq < 75;
              return (
                <TableRow key={m.id} className={abaixo ? "bg-destructive/5" : undefined}>
                  <TableCell className="font-medium">{m.beneficiaria?.nome ?? "—"}</TableCell>
                  <TableCell className="text-sm">{m.beneficiaria?.cpf ? formatCpf(m.beneficiaria.cpf) : "—"}</TableCell>
                  <TableCell>
                    {typeof freq === "number" ? (
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${abaixo ? "text-destructive" : ""}`}>
                        {abaixo ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                        {freq.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex overflow-hidden rounded-md border">
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setLocal((p) => ({ ...p, [m.id]: { ...v, presente: true } }))}
                        className={`px-2 py-1 text-xs ${v.presente ? "bg-green-500/20 text-green-700 dark:text-green-400" : "text-muted-foreground"}`}
                      >
                        <Check className="mr-1 inline h-3 w-3" /> P
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setLocal((p) => ({ ...p, [m.id]: { ...v, presente: false } }))}
                        className={`px-2 py-1 text-xs ${!v.presente ? "bg-destructive/20 text-destructive" : "text-muted-foreground"}`}
                      >
                        <X className="mr-1 inline h-3 w-3" /> F
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder={v.presente ? "—" : "Motivo da falta"}
                      disabled={v.presente || !canWrite}
                      value={v.justificativa}
                      onChange={(e) => setLocal((p) => ({ ...p, [m.id]: { ...v, justificativa: e.target.value } }))}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  const cls = tone === "green" ? "text-green-700 dark:text-green-400" : tone === "red" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex flex-col items-center rounded-md border px-3 py-1">
      <span className={`text-lg font-semibold ${cls}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}