import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pencil, Target } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  atualizarMeta,
  corSemaforo,
  indicadoresCicloOptions,
  metasListOptions,
  semaforo,
  type IndicadorCiclo,
  type Meta,
} from "@/lib/metas-queries";

export const Route = createFileRoute("/_authenticated/relatorios/indicadores")({
  head: () => ({ meta: [{ title: "Metas e Indicadores · Relatórios" }] }),
  component: IndicadoresPage,
});

function pct(concluintes: number, previstas: number): number {
  if (!previstas) return 0;
  return (concluintes / previstas) * 100;
}

function IndicadoresPage() {
  const qc = useQueryClient();
  const indQ = useQuery(indicadoresCicloOptions());
  const metasQ = useQuery(metasListOptions());
  const [ciclo, setCiclo] = useState<string>("todos");
  const [editando, setEditando] = useState<Meta | null>(null);

  const rows = indQ.data?.rows ?? [];
  const filtradas = useMemo(
    () => (ciclo === "todos" ? rows : rows.filter((r) => String(r.ciclo) === ciclo)),
    [rows, ciclo],
  );

  const totais = useMemo(() => {
    const t = { previstas: 0, matriculadas: 0, concluintes: 0, certificadas: 0, freqSoma: 0, freqN: 0 };
    for (const r of filtradas) {
      t.previstas += Number(r.vagas_previstas ?? 0);
      t.matriculadas += Number(r.matriculadas ?? 0);
      t.concluintes += Number(r.concluintes ?? 0);
      t.certificadas += Number(r.certificadas ?? 0);
      const f = Number(r.frequencia_media ?? 0);
      if (f) {
        t.freqSoma += f;
        t.freqN += 1;
      }
    }
    return t;
  }, [filtradas]);

  const pctGlobal = pct(totais.concluintes, totais.previstas);
  const freqMedia = totais.freqN ? totais.freqSoma / totais.freqN : 0;
  const erro = indQ.data?.error ?? (indQ.isError ? String(indQ.error) : null);

  function findMeta(r: IndicadorCiclo): Meta | undefined {
    return (metasQ.data?.rows ?? []).find(
      (m) =>
        String(m.ciclo) === String(r.ciclo) &&
        (m.municipio ?? "") === (r.municipio ?? "") &&
        (m.curso ?? "") === (r.curso ?? ""),
    );
  }

  return (
    <div>
      <PageHeader
        title="Metas e Indicadores"
        description="Vagas previstas vs. matriculadas, concluintes, certificadas e frequência média por ciclo."
      />

      <div className="mb-4 flex items-center gap-3">
        <Label className="text-xs uppercase text-muted-foreground">Ciclo</Label>
        <Select value={ciclo} onValueChange={setCiclo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="1">Ciclo 1</SelectItem>
            <SelectItem value="2">Ciclo 2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Vagas previstas" value={totais.previstas} />
        <Kpi label="Matriculadas" value={totais.matriculadas} />
        <Kpi label="Concluintes" value={totais.concluintes} />
        <Kpi label="Certificadas" value={totais.certificadas} />
        <Kpi label="% Conclusão" value={`${pctGlobal.toFixed(1)}%`} accent={corSemaforo(semaforo(pctGlobal))} />
      </div>

      <div className="mb-4 text-xs text-muted-foreground">
        Frequência média (das turmas com dado): <strong>{freqMedia.toFixed(1)}%</strong>
      </div>

      {erro ? (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">View indisponível</div>
            <div className="break-words text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ciclo</TableHead>
              <TableHead>Município</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead className="text-right">Previstas</TableHead>
              <TableHead className="text-right">Matric.</TableHead>
              <TableHead className="text-right">Conclu.</TableHead>
              <TableHead className="text-right">Certif.</TableHead>
              <TableHead className="text-right">Freq. média</TableHead>
              <TableHead className="text-right">% Conclusão</TableHead>
              <TableHead className="w-24 text-right">Meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((r, i) => {
              const p = pct(Number(r.concluintes ?? 0), Number(r.vagas_previstas ?? 0));
              const s = semaforo(p);
              const meta = findMeta(r);
              return (
                <TableRow key={i}>
                  <TableCell>{r.ciclo ?? "—"}</TableCell>
                  <TableCell>{r.municipio ?? "—"}</TableCell>
                  <TableCell className="max-w-[240px] truncate">{r.curso ?? "—"}</TableCell>
                  <TableCell className="text-right">{Number(r.vagas_previstas ?? 0)}</TableCell>
                  <TableCell className="text-right">{Number(r.matriculadas ?? 0)}</TableCell>
                  <TableCell className="text-right">{Number(r.concluintes ?? 0)}</TableCell>
                  <TableCell className="text-right">{Number(r.certificadas ?? 0)}</TableCell>
                  <TableCell className="text-right">
                    {r.frequencia_media != null ? `${Number(r.frequencia_media).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", corSemaforo(s))}>
                      {p.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {meta ? (
                      <Button size="icon" variant="ghost" onClick={() => setEditando(meta)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Target className="ml-auto h-3.5 w-3.5 text-muted-foreground/50" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!filtradas.length && !indQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  Sem indicadores para o ciclo selecionado.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <EditarMetaDialog
        meta={editando}
        onClose={() => setEditando(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["metas"] });
        }}
      />
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", accent ? `${accent} inline-block rounded px-2 py-0.5` : "")}>{value}</div>
    </div>
  );
}

function EditarMetaDialog({
  meta,
  onClose,
  onSaved,
}: {
  meta: Meta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vagas, setVagas] = useState<string>("");
  const [conclusao, setConclusao] = useState<string>("");
  const [freq, setFreq] = useState<string>("");

  useMemo(() => {
    setVagas(String(meta?.vagas_previstas ?? ""));
    setConclusao(String(meta?.meta_conclusao_pct ?? ""));
    setFreq(String(meta?.meta_frequencia_pct ?? ""));
  }, [meta]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!meta) return;
      await atualizarMeta({
        id: meta.id,
        vagas_previstas: Number(vagas) || 0,
        meta_conclusao_pct: Number(conclusao) || 0,
        meta_frequencia_pct: Number(freq) || 0,
      });
    },
    onSuccess: () => {
      toast.success("Meta atualizada.");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <Dialog open={!!meta} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar meta</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">
            Ciclo {meta?.ciclo} · {meta?.municipio} · {meta?.curso}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Vagas previstas</Label>
              <Input value={vagas} onChange={(e) => setVagas(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <Label className="text-xs">Meta conclusão %</Label>
              <Input value={conclusao} onChange={(e) => setConclusao(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <Label className="text-xs">Meta frequência %</Label>
              <Input value={freq} onChange={(e) => setFreq(e.target.value)} inputMode="numeric" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}