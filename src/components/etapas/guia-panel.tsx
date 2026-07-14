import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, RefreshCcw, Sparkles, ArrowRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { orbeGuiaAtividade, type GuiaIA } from "@/lib/guia-ia.functions";
import { orbeChat } from "@/lib/orbe.functions";

export function GuiaPanel({ atividadeId, guiaCache }: { atividadeId: string; guiaCache: unknown | null }) {
  const qc = useQueryClient();
  const gerarFn = useServerFn(orbeGuiaAtividade);
  const chatFn = useServerFn(orbeChat as any);
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<string | null>(null);

  const guiaQ = useQuery({
    queryKey: ["guia-ia", atividadeId],
    queryFn: async (): Promise<GuiaIA> => {
      if (guiaCache) return guiaCache as GuiaIA;
      const r = await gerarFn({ data: { atividadeId } });
      return r.guia as GuiaIA;
    },
  });

  const regen = useMutation({
    mutationFn: async () => gerarFn({ data: { atividadeId, regenerar: true } }),
    onSuccess: (r) => {
      qc.setQueryData(["guia-ia", atividadeId], r.guia);
      qc.invalidateQueries({ queryKey: ["etapas"] });
      qc.invalidateQueries({ queryKey: ["minhas-demandas"] });
      toast.success("Guia regenerado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const perguntar = useMutation({
    mutationFn: async () => {
      if (!pergunta.trim()) throw new Error("Escreva uma pergunta.");
      const r: any = await chatFn({
        data: {
          mensagem: `Sobre a demanda "${(guiaQ.data as GuiaIA | undefined)?.resumo ?? atividadeId}": ${pergunta}`,
        },
      });
      return (r?.resposta ?? r?.texto ?? "").toString();
    },
    onSuccess: (r) => setResposta(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const guia = guiaQ.data;

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" /> Guia
          <Badge variant="outline" className="text-[10px]">IA</Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => regen.mutate()}
          disabled={regen.isPending || guiaQ.isFetching}
        >
          {regen.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1 h-3.5 w-3.5" />}
          Regenerar
        </Button>
      </div>

      {guiaQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando guia…
        </div>
      ) : !guia ? (
        <p className="text-sm text-muted-foreground">Nenhum guia disponível.</p>
      ) : (
        <>
          {guia.resumo && <p className="text-sm">{guia.resumo}</p>}
          {guia.por_que_importa && (
            <p className="text-xs text-muted-foreground"><b>Por que importa:</b> {guia.por_que_importa}</p>
          )}
          {guia.passos?.length > 0 && (
            <ol className="ml-5 list-decimal space-y-1 text-sm">
              {guia.passos.map((p, i) => (
                <li key={i}>
                  <span>{p.acao}</span>
                  {p.rota && (
                    <Link to={p.rota} className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> {p.rota}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          )}
          {guia.proxima_acao?.label && (
            <div>
              {guia.proxima_acao.rota ? (
                <Button asChild size="sm" className="gap-1">
                  <Link to={guia.proxima_acao.rota}>
                    <ArrowRight className="h-3.5 w-3.5" /> {guia.proxima_acao.label}
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled>{guia.proxima_acao.label}</Button>
              )}
            </div>
          )}
          {guia.referencias && guia.referencias.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Referências: {guia.referencias.join(" · ")}
            </p>
          )}
        </>
      )}

      <Separator />
      <div className="grid gap-2">
        <label className="text-xs font-medium">Pergunte ao Orbe sobre esta demanda</label>
        <Textarea
          rows={2}
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Ex.: preciso pedir 3 cotações, como registro?"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => perguntar.mutate()} disabled={!pergunta.trim() || perguntar.isPending}>
            {perguntar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Perguntar
          </Button>
        </div>
        {resposta && (
          <div className="rounded-md border bg-background p-2 text-sm whitespace-pre-wrap">{resposta}</div>
        )}
      </div>
    </div>
  );
}