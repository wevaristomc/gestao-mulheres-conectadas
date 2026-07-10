import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Download, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  pendentesFinanceiroOptions, relacaoDetalheOptions,
  decidirRelacao, type RelacaoStatus,
} from "@/lib/relacao-horas-queries";
import { gerarPdfRelacaoHoras } from "@/lib/relacao-horas-pdf";

export const Route = createFileRoute("/_authenticated/financeiro/relacoes-horas")({
  head: () => ({ meta: [{ title: "Relações de Horas · Financeiro" }] }),
  beforeLoad: () => requireModuleAccess("financeiro-relacoes-horas"),
  component: FinanceiroRelacoesPage,
});

function statusBadge(s: RelacaoStatus) {
  const map: Record<RelacaoStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    rascunho: { label: "Rascunho", variant: "outline" },
    enviada: { label: "Aguardando", variant: "secondary" },
    aprovada: { label: "Aprovada", variant: "default" },
    rejeitada: { label: "Rejeitada", variant: "destructive" },
  };
  const c = map[s];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function FinanceiroRelacoesPage() {
  const { user } = useActiveContext();
  const qc = useQueryClient();
  const listaQ = useQuery(pendentesFinanceiroOptions());
  const [aberta, setAberta] = useState<string | null>(null);
  const [obs, setObs] = useState("");

  const detalheQ = useQuery(relacaoDetalheOptions(aberta));

  const decidirMut = useMutation({
    mutationFn: async (decisao: "aprovada" | "rejeitada") => {
      const rel = detalheQ.data?.relacao;
      if (!user || !rel) throw new Error("Sem seleção");
      if (decisao === "rejeitada" && !obs.trim()) throw new Error("Descreva o motivo da rejeição");
      await decidirRelacao({
        relacaoId: rel.id,
        avaliadorId: user.id,
        decisao,
        observacao: obs,
        professorUserId: rel.user_id,
      });
    },
    onSuccess: () => {
      toast.success("Decisão registrada");
      setAberta(null);
      setObs("");
      qc.invalidateQueries({ queryKey: ["relacoes-horas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function baixarPdf() {
    const rel = detalheQ.data?.relacao;
    const itens = detalheQ.data?.itens ?? [];
    if (!rel) return;
    const doc = gerarPdfRelacaoHoras({
      relacao: rel,
      itens,
      professorNome: rel.assinatura_nome ?? "—",
    });
    doc.save(`relacao-horas-${rel.mes_referencia.slice(0, 7)}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 text-sm font-medium">Relações enviadas</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Assinada por</TableHead>
              <TableHead>Enviada em</TableHead>
              <TableHead>Total horas</TableHead>
              <TableHead>Valor total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(listaQ.data?.rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.mes_referencia.slice(0, 7)}</TableCell>
                <TableCell>{r.assinatura_nome ?? "—"}</TableCell>
                <TableCell>{r.enviado_em ? new Date(r.enviado_em).toLocaleString("pt-BR") : "—"}</TableCell>
                <TableCell>{Number(r.total_horas).toFixed(2)}</TableCell>
                <TableCell>{Number(r.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => { setAberta(r.id); setObs(r.observacao_avaliacao ?? ""); }}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(listaQ.data?.rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma relação enviada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Relação de Horas — {detalheQ.data?.relacao?.mes_referencia.slice(0, 7)}</DialogTitle>
          </DialogHeader>

          {detalheQ.data?.relacao && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><b>Assinada por:</b> {detalheQ.data.relacao.assinatura_nome ?? "—"}</div>
                <div><b>Status:</b> {statusBadge(detalheQ.data.relacao.status)}</div>
                <div><b>Total horas:</b> {Number(detalheQ.data.relacao.total_horas).toFixed(2)}</div>
                <div><b>Valor total:</b> {Number(detalheQ.data.relacao.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  Hash: {detalheQ.data.relacao.assinatura_hash?.slice(0, 16)}…
                </div>
              </div>

              <div className="max-h-[40vh] overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>Horas</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detalheQ.data.itens ?? []).filter((i) => Number(i.total_horas) > 0).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.data.split("-").reverse().join("/")}</TableCell>
                        <TableCell>{i.hora_entrada?.slice(0, 5) ?? "—"}</TableCell>
                        <TableCell>{i.hora_saida?.slice(0, 5) ?? "—"}</TableCell>
                        <TableCell>{Number(i.total_horas).toFixed(2)}</TableCell>
                        <TableCell>{Number(i.valor_dia).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Observação</label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)}
                  disabled={detalheQ.data.relacao.status !== "enviada"} rows={3} />
              </div>
            </>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={baixarPdf}>
              <Download className="mr-1 h-4 w-4" /> PDF
            </Button>
            {detalheQ.data?.relacao?.status === "enviada" && (
              <>
                <Button variant="destructive" onClick={() => decidirMut.mutate("rejeitada")} disabled={decidirMut.isPending}>
                  {decidirMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}
                  Rejeitar
                </Button>
                <Button onClick={() => decidirMut.mutate("aprovada")} disabled={decidirMut.isPending}>
                  {decidirMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  Aprovar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}