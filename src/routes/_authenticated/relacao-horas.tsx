import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, FileText, Plus, Send, Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  minhasRelacoesOptions, relacaoDetalheOptions,
  gerarRascunhoDoMes, salvarItem, assinarEEnviar, recomputarTotais,
  type RelacaoStatus, type RelacaoItem,
} from "@/lib/relacao-horas-queries";
import { gerarPdfRelacaoHoras } from "@/lib/relacao-horas-pdf";

export const Route = createFileRoute("/_authenticated/relacao-horas")({
  head: () => ({ meta: [{ title: "Relação de Horas · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("relacao-horas"),
  component: RelacaoHorasPage,
});

function statusBadge(s: RelacaoStatus) {
  const map: Record<RelacaoStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    rascunho: { label: "Rascunho", variant: "outline" },
    enviada: { label: "Enviada", variant: "secondary" },
    aprovada: { label: "Aprovada", variant: "default" },
    rejeitada: { label: "Rejeitada", variant: "destructive" },
  };
  const c = map[s];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function RelacaoHorasPage() {
  const { user } = useActiveContext();
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesAtual());
  const [local, setLocal] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [assinarOpen, setAssinarOpen] = useState(false);
  const [nomeAssinatura, setNomeAssinatura] = useState("");

  const listaQ = useQuery(minhasRelacoesOptions(user?.id ?? null));
  const detalheQ = useQuery(relacaoDetalheOptions(selecionada));

  const gerarMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sem sessão");
      return gerarRascunhoDoMes({ userId: user.id, mes, localTrabalho: local || undefined });
    },
    onSuccess: ({ relacaoId }) => {
      toast.success("Rascunho gerado");
      qc.invalidateQueries({ queryKey: ["relacoes-horas"] });
      setSelecionada(relacaoId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarMut = useMutation({
    mutationFn: async () => {
      if (!user || !selecionada) throw new Error("Sem seleção");
      if (!nomeAssinatura.trim()) throw new Error("Digite seu nome completo");
      return assinarEEnviar({ relacaoId: selecionada, userId: user.id, nomeAssinatura: nomeAssinatura.trim() });
    },
    onSuccess: () => {
      toast.success("Enviada ao financeiro");
      setAssinarOpen(false);
      setNomeAssinatura("");
      qc.invalidateQueries({ queryKey: ["relacoes-horas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const relacao = detalheQ.data?.relacao ?? null;
  const itens = detalheQ.data?.itens ?? [];
  const isRascunho = relacao?.status === "rascunho";

  async function onEditarItem(item: RelacaoItem, campo: "hora_entrada" | "hora_saida", valor: string) {
    if (!relacao) return;
    const patch: RelacaoItem = { ...item, [campo]: valor || null };
    try {
      await salvarItem({
        id: item.id,
        hora_entrada: patch.hora_entrada,
        hora_saida: patch.hora_saida,
        valor_hora: Number(relacao.valor_hora),
      });
      await recomputarTotais(relacao.id);
      qc.invalidateQueries({ queryKey: ["relacoes-horas", "detalhe", relacao.id] });
      qc.invalidateQueries({ queryKey: ["relacoes-horas", "minhas"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function baixarPdf() {
    if (!relacao) return;
    const doc = gerarPdfRelacaoHoras({
      relacao,
      itens,
      professorNome: relacao.assinatura_nome || user?.email || "—",
    });
    doc.save(`relacao-horas-${relacao.mes_referencia.slice(0, 7)}.pdf`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relação de Horas"
        description="Gere sua folha de horas mensal a partir das aulas ministradas e envie ao financeiro."
      />

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="mes">Mês de referência</Label>
            <Input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[240px]">
            <Label htmlFor="local">Local de trabalho</Label>
            <Input id="local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Escola X" />
          </div>
          <Button onClick={() => gerarMut.mutate()} disabled={gerarMut.isPending}>
            {gerarMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Gerar do mês
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border bg-card p-2">
          <div className="border-b p-2 text-sm font-medium">Minhas relações</div>
          <div className="divide-y">
            {(listaQ.data?.rows ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => setSelecionada(r.id)}
                className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm hover:bg-accent ${
                  selecionada === r.id ? "bg-accent" : ""
                }`}
              >
                <span>{r.mes_referencia.slice(0, 7)}</span>
                {statusBadge(r.status)}
              </button>
            ))}
            {listaQ.data?.rows?.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">Nenhuma relação. Gere a do mês.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          {!relacao ? (
            <div className="text-sm text-muted-foreground">Selecione ou gere uma relação para visualizar.</div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <div className="font-medium">
                    {relacao.mes_referencia.slice(0, 7)} — {statusBadge(relacao.status)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={baixarPdf}>
                    <Download className="mr-1 h-4 w-4" /> PDF
                  </Button>
                  {isRascunho && (
                    <Button size="sm" onClick={() => setAssinarOpen(true)}>
                      <Send className="mr-1 h-4 w-4" /> Assinar e enviar
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-[60vh] overflow-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Data</TableHead>
                      <TableHead>Dia</TableHead>
                      <TableHead className="w-[120px]">Entrada</TableHead>
                      <TableHead className="w-[120px]">Saída</TableHead>
                      <TableHead className="w-[100px]">Horas</TableHead>
                      <TableHead className="w-[120px]">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((it) => {
                      const dt = new Date(it.data + "T12:00:00");
                      const dow = dt.getDay();
                      const isWknd = dow === 0 || dow === 6;
                      const nomes = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
                      return (
                        <TableRow key={it.id} className={isWknd ? "bg-muted/40" : ""}>
                          <TableCell>{it.data.split("-").reverse().join("/")}</TableCell>
                          <TableCell>{nomes[dow]}</TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              disabled={!isRascunho || isWknd}
                              defaultValue={it.hora_entrada ?? ""}
                              onBlur={(e) => onEditarItem(it, "hora_entrada", e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              disabled={!isRascunho || isWknd}
                              defaultValue={it.hora_saida ?? ""}
                              onBlur={(e) => onEditarItem(it, "hora_saida", e.target.value)}
                            />
                          </TableCell>
                          <TableCell>{Number(it.total_horas || 0).toFixed(2)}</TableCell>
                          <TableCell>{Number(it.valor_dia || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex justify-end gap-6 text-sm">
                <div><span className="text-muted-foreground">Total horas: </span><b>{Number(relacao.total_horas).toFixed(2)}</b></div>
                <div><span className="text-muted-foreground">Total: </span><b>{Number(relacao.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></div>
              </div>
              {relacao.observacao_avaliacao && (
                <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  <b>Observação do financeiro:</b> {relacao.observacao_avaliacao}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={assinarOpen} onOpenChange={setAssinarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinar e enviar ao financeiro</DialogTitle>
            <DialogDescription>
              Ao assinar, você declara que as horas informadas são verdadeiras. Uma assinatura digital
              (SHA-256 sobre os itens) será gerada e a relação passa a "enviada".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome completo</Label>
            <Input id="nome" value={nomeAssinatura} onChange={(e) => setNomeAssinatura(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssinarOpen(false)}>Cancelar</Button>
            <Button onClick={() => enviarMut.mutate()} disabled={enviarMut.isPending}>
              {enviarMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Assinar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}