import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { consultarViewMTE } from "@/lib/mte-relatorios.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mte/checklist")({
  component: ChecklistFiscalizacao,
});

type Row = Record<string, unknown>;

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "sim" || v === "ok" || v === "verde") return true;
  if (v === "nao" || v === "não" || v === "pendente" || v === "vermelho") return false;
  if (v == null) return null;
  return null;
}

function ChecklistFiscalizacao() {
  const fn = useServerFn(consultarViewMTE);
  const [state, setState] = useState<{ rows: Row[]; error: string | null; loading: boolean }>({
    rows: [], error: null, loading: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fn({ data: { view: "vw_checklist_fiscalizacao" } });
        const rows = JSON.parse(res.rowsJson || "[]") as Row[];
        setState({ rows, error: res.error, loading: false });
      } catch (e) {
        setState({ rows: [], error: e instanceof Error ? e.message : String(e), loading: false });
      }
    })();
  }, [fn]);

  return (
    <div>
      <PageHeader
        title="Checklist de Fiscalização"
        description="Status consolidado por turma dos itens exigidos pela fiscalização MTE."
      />

      {state.loading ? (
        <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : state.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">View `vw_checklist_fiscalizacao` indisponível</div>
            <div className="text-xs opacity-80 break-words">{state.error}</div>
          </div>
        </div>
      ) : state.rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sem dados no checklist.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {state.rows.map((r, i) => {
            const titulo = String(r.turma_codigo ?? r.turma ?? r.turma_nome ?? `Turma ${i + 1}`);
            const subtitulo = r.curso_nome ? String(r.curso_nome) : null;
            const itens = Object.entries(r).filter(([k]) =>
              !["turma_codigo","turma","turma_nome","curso_nome","id","turma_id"].includes(k),
            );
            const ok = itens.filter(([, v]) => toBool(v) === true).length;
            const total = itens.filter(([, v]) => toBool(v) !== null).length;
            return (
              <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{titulo}</div>
                    {subtitulo ? <div className="text-xs text-muted-foreground line-clamp-1">{subtitulo}</div> : null}
                  </div>
                  <div className={cn(
                    "text-xs font-semibold tabular-nums",
                    total > 0 && ok === total ? "text-emerald-600" : ok >= total * 0.7 ? "text-amber-600" : "text-destructive",
                  )}>{ok}/{total}</div>
                </div>
                <div className="space-y-1">
                  {itens.map(([k, v]) => {
                    const b = toBool(v);
                    return (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        {b === true ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : b === false ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full bg-muted shrink-0" />
                        )}
                        <span className="truncate">{k.replace(/_/g, " ")}</span>
                        {b == null ? (
                          <span className="ml-auto text-muted-foreground">{String(v ?? "—")}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
