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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  minhasRelacoesOptions, relacaoDetalheOptions,
  gerarRascunhoDoMes, salvarItem, assinarEEnviar, recomputarTotais,
  turmasDoUsuarioOptions, classificarTurno,
  type RelacaoStatus, type RelacaoItem,
} from "@/lib/relacao-horas-queries";
import { locaisOptions } from "@/lib/locais-queries";
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
  const turmasQ = useQuery(turmasDoUsuarioOptions(user?.id ?? null));
  const locaisQ = useQuery(locaisOptions(true));

  // Pré-preenche local se todas as turmas compartilham o mesmo
  useMemo(() => {
    if (local) return;
    const rows = turmasQ.data?.rows ?? [];
    if (rows.length === 0) return;
    const nomes = Array.from(new Set(rows.map((r) => r.local_nome).filter(Boolean))) as string[];
    if (nomes.length === 1) setLocal(nomes[0]);
  }, [turmasQ.data, local]);

  // Turmas do mês em locais diferentes?
  const turmasMulti = (() => {
    const rows = turmasQ.data?.rows ?? [];
    const set = new Set(rows.map((r) => r.local_nome).filter(Boolean));
    return set.size > 1;
  })();

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

  async function onEditarItem(
    item: RelacaoItem,
    campo: "hora_entrada" | "saida_almoco" | "retorno" | "hora_saida" | "conteudo" | "local_nome",
    valor: string,
  ) {
    if (!relacao) return;
    const patch: RelacaoItem = { ...item, [campo]: valor || null } as RelacaoItem;
    try {
      await salvarItem({
        id: item.id,
        hora_entrada: patch.hora_entrada,
        saida_almoco: patch.saida_almoco,
        retorno: patch.retorno,
        hora_saida: patch.hora_saida,
        valor_hora: Number(relacao.valor_hora),
        conteudo: patch.conteudo,
        local_nome: patch.local_nome,
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
      turmas: turmasQ.data?.rows ?? [],
    });
    doc.save(`relacao-horas-${relacao.mes_referencia.slice(0, 7)}.pdf`);
  }

  const turnoNome: Record<string, string> = { manha: "manhã", tarde: "tarde", noite: "noite" };

  return (
    <div className="space-y-6">
      <PageHeader
        helpId="relacao.assinatura_digital"
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
            <Select value={local || "none"} onValueChange={(v) => setLocal(v === "none" ? "" : v)}>
              <SelectTrigger id="local"><SelectValue placeholder="Selecione o local" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(locaisQ.data?.rows ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.nome}>
                    {l.nome}{l.municipio ? ` — ${l.municipio}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => gerarMut.mutate()} disabled={gerarMut.isPending}>
            {gerarMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Gerar do mês
          </Button>
        </div>
        {turmasMulti && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            Suas turmas estão em locais diferentes. Cada linha da relação pode ter seu próprio local.
          </div>
        )}
        {(turmasQ.data?.rows ?? []).length > 0 && (
          <div className="mt-3 rounded border bg-muted/30 p-2 text-xs">
            <div className="mb-1 font-medium text-muted-foreground">Turmas vinculadas detectadas</div>
            <ul className="space-y-1">
              {turmasQ.data!.rows.map((t) => (
                <li key={t.turma_id}>
                  <b>Turma da {turnoNome[classificarTurno(t)]}:</b>{" "}
                  {t.codigo ?? t.nome ?? "—"} — {(t.hora_inicio ?? "").slice(0, 5)} às {(t.hora_fim ?? "").slice(0, 5)}
                  {" · R$ "}{Number(t.valor_hora).toFixed(2)}/h
                  {t.local_nome ? ` · ${t.local_nome}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
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
                      {turmasMulti && <TableHead className="w-[160px]">Local</TableHead>}
                      <TableHead className="w-[110px]">Entrada</TableHead>
                      <TableHead className="w-[110px]">Saída Almoço</TableHead>
                      <TableHead className="w-[110px]">Retorno</TableHead>
                      <TableHead className="w-[110px]">Saída</TableHead>
                      <TableHead className="w-[70px]">Horas</TableHead>
                      <TableHead className="w-[110px]">Valor</TableHead>
                      <TableHead>Conteúdo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((it) => {
                      const dt = new Date(it.data + "T12:00:00");
                      const dow = dt.getDay();
                      const nomes = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
                      return (
                        <TableRow key={it.id}>
                          <TableCell>{it.data.split("-").reverse().join("/")}</TableCell>
                          <TableCell>{nomes[dow]}</TableCell>
                          {turmasMulti && (
                            <TableCell>
                              <Select
                                disabled={!isRascunho}
                                value={it.local_nome ?? "none"}
                                onValueChange={(v) => onEditarItem(it, "local_nome", v === "none" ? "" : v)}
                              >
                                <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">—</SelectItem>
                                  {(locaisQ.data?.rows ?? []).map((l) => (
                                    <SelectItem key={l.id} value={l.nome}>{l.nome}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell>
                            <Input type="time" disabled={!isRascunho}
                              defaultValue={it.hora_entrada ?? ""}
                              onBlur={(e) => onEditarItem(it, "hora_entrada", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="time" disabled={!isRascunho}
                              defaultValue={it.saida_almoco ?? ""}
                              onBlur={(e) => onEditarItem(it, "saida_almoco", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="time" disabled={!isRascunho}
                              defaultValue={it.retorno ?? ""}
                              onBlur={(e) => onEditarItem(it, "retorno", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="time" disabled={!isRascunho}
                              defaultValue={it.hora_saida ?? ""}
                              onBlur={(e) => onEditarItem(it, "hora_saida", e.target.value)} />
                          </TableCell>
                          <TableCell>{Number(it.total_horas || 0).toFixed(2)}</TableCell>
                          <TableCell>{Number(it.valor_dia || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                          <TableCell>
                            <Input disabled={!isRascunho}
                              defaultValue={it.conteudo ?? ""}
                              onBlur={(e) => onEditarItem(it, "conteudo", e.target.value)} />
                          </TableCell>
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