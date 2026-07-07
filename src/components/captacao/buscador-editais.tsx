import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ExternalLink, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useActiveContext } from "@/hooks/use-active-context";
import { buscarEditais, atualizarSituacaoEdital } from "@/lib/editais-busca.functions";
import {
  CATEGORIAS, ESFERAS, SITUACOES,
  categoriaCor, categoriaLabel,
  editaisBuscadosOptions, ultimaBuscaOptions,
} from "@/lib/ia-queries";
import { formatBRL, formatarData, diasAte } from "@/lib/captacao-queries";

export function BuscadorEditais() {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();

  const [categoria, setCategoria] = useState<string>("");
  const [esfera, setEsfera] = useState<string>("");
  const [situacao, setSituacao] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const listaQ = useQuery(editaisBuscadosOptions({ projetoId, categoria: categoria || undefined, esfera: esfera || undefined, situacao: situacao || undefined, q }));
  const buscaQ = useQuery(ultimaBuscaOptions());

  const executando = (buscaQ.data as any)?.status === "executando";

  const buscarMut = useMutation({
    mutationFn: async () => {
      if (!projetoId) throw new Error("Selecione um projeto.");
      return await buscarEditais({ data: { projetoId } });
    },
    onSuccess: (r: any) => {
      toast.success(`Busca concluída — ${r.editaisNovos} novo(s) edital(is) em ${r.fontesConsultadas} fonte(s).`);
      qc.invalidateQueries({ queryKey: ["editais"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const situacaoMut = useMutation({
    mutationFn: async (v: { id: string; situacao: any }) => await atualizarSituacaoEdital({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["editais", "buscados"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listaQ.data?.rows ?? [];
  const erro = listaQ.data?.error ?? (listaQ.isError ? String(listaQ.error) : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
        <Button
          onClick={() => buscarMut.mutate()}
          disabled={buscarMut.isPending || executando || !projetoId}
          className="gap-2"
        >
          {buscarMut.isPending || executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {executando ? "Buscando…" : "🔄 Buscar Novos Editais"}
        </Button>
        {buscaQ.data ? (
          <div className="text-xs text-muted-foreground">
            Última busca: <span className="font-medium">{(buscaQ.data as any).status}</span> ·{" "}
            {(buscaQ.data as any).editais_novos ?? 0} novos em {(buscaQ.data as any).fontes_consultadas ?? 0} fontes ·{" "}
            {formatarData((buscaQ.data as any).iniciada_em)}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar título…" className="pl-8" />
        </div>
        <Select value={categoria || "__all"} onValueChange={(v) => setCategoria(v === "__all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas categorias</SelectItem>
            {CATEGORIAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={esfera || "__all"} onValueChange={(v) => setEsfera(v === "__all" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Esfera" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas esferas</SelectItem>
            {ESFERAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={situacao || "__all"} onValueChange={(v) => setSituacao(v === "__all" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas situações</SelectItem>
            {SITUACOES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Não foi possível carregar os editais</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : listaQ.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-40" /><Skeleton className="h-40" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum edital encontrado com os filtros atuais. Clique em <b>Buscar Novos Editais</b> para consultar as fontes.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => <EditalBuscadoCard key={r.id} row={r} onSituacao={(s) => situacaoMut.mutate({ id: r.id, situacao: s })} />)}
        </div>
      )}
    </div>
  );
}

function EditalBuscadoCard({ row, onSituacao }: { row: any; onSituacao: (s: string) => void }) {
  const dias = diasAte(row.data_encerramento);
  const prazoTone =
    dias == null ? "text-muted-foreground"
      : dias < 0 ? "text-destructive"
      : dias < 7 ? "text-destructive font-medium"
      : dias <= 15 ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";
  const ader = typeof row.aderencia_score === "number" ? Math.max(0, Math.min(100, row.aderencia_score)) : null;

  return (
    <div className="rounded-md border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm line-clamp-2">{row.titulo}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{row.orgao ?? "—"}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {row.categoria ? (
            <Badge variant="outline" className={cn("text-[10px]", categoriaCor(row.categoria))}>
              {categoriaLabel(row.categoria)}
            </Badge>
          ) : null}
          {row.esfera ? <Badge variant="secondary" className="text-[10px] capitalize">{row.esfera}</Badge> : null}
        </div>
      </div>

      {row.resumo_ia ? (
        <div className="flex gap-1.5 text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">
          <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
          <span className="line-clamp-3">{row.resumo_ia}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Encerra</div>
          <div className={prazoTone}>
            {formatarData(row.data_encerramento)} {dias != null ? <span className="text-[10px]">({dias >= 0 ? `${dias}d` : "vencido"})</span> : null}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Valor</div>
          <div>{typeof row.valor_total === "number" ? formatBRL(row.valor_total) : "—"}</div>
        </div>
      </div>

      {ader != null ? (
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Aderência</span><span>{ader}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5">
            <div className={cn("h-full", ader >= 70 ? "bg-emerald-500" : ader >= 40 ? "bg-amber-500" : "bg-destructive")} style={{ width: `${ader}%` }} />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <Badge variant="outline" className="text-[10px] capitalize">{row.situacao ?? "novo"}</Badge>
        <div className="ml-auto flex gap-1">
          {row.url_edital ? (
            <Button asChild size="sm" variant="ghost" className="h-7 px-2">
              <a href={String(row.url_edital)} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
          <Select value={row.situacao ?? "novo"} onValueChange={onSituacao}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SITUACOES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}