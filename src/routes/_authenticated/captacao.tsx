import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, CalendarDays, ExternalLink, Loader2, Plus, Trash2, User2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BuscadorEditais } from "@/components/captacao/buscador-editais";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  ETAPAS,
  deleteEdital,
  diasAte,
  editaisListOptions,
  etapaLabel,
  formatBRL,
  formatarData,
  historicoEditalOptions,
  moverEtapa,
  pickFirst,
  registrarHistorico,
  toNumber,
  upsertEdital,
  type EtapaKey,
  type Row,
} from "@/lib/captacao-queries";

export const Route = createFileRoute("/_authenticated/captacao")({
  head: () => ({ meta: [{ title: "Captação · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("captacao"),
  component: CaptacaoPage,
});

function CaptacaoPage() {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();
  const q = useQuery(editaisListOptions(projetoId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  const [novoOpen, setNovoOpen] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pipeline" | "buscador">("pipeline");

  const porEtapa = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const e of ETAPAS) map.set(e.key, []);
    for (const r of rows) {
      const key = String(r.etapa ?? "identificado");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  const totalPipeline = rows.reduce((s, r) => s + toNumber(r.valor_previsto), 0);
  const emAndamento = rows.filter((r) =>
    ["identificado", "em_analise", "em_elaboracao", "submetido"].includes(String(r.etapa)),
  ).length;
  const aprovados = rows.filter((r) => String(r.etapa) === "aprovado").length;
  const taxaAprovacao = rows.length > 0 ? (aprovados / rows.length) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Captação"
        description="Pipeline de editais e novos termos de fomento, com etapas, responsáveis e histórico."
        actions={
          <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!projetoId}>
                <Plus className="mr-1.5 h-4 w-4" /> Novo edital
              </Button>
            </DialogTrigger>
            {projetoId ? (
              <EditalFormDialog
                projetoId={projetoId}
                edital={null}
                onClose={() => setNovoOpen(false)}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["captacao", "editais", projetoId] });
                  setNovoOpen(false);
                }}
              />
            ) : null}
          </Dialog>
        }
      />

      <div className="mb-4 flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab("pipeline")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm transition-colors",
            tab === "pipeline" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Pipeline
        </button>
        <button
          type="button"
          onClick={() => setTab("buscador")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm transition-colors",
            tab === "buscador" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          🔎 Buscador de Editais
        </button>
      </div>

      {tab === "buscador" ? (
        <BuscadorEditais />
      ) : (
        <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Editais em pipeline" value={String(rows.length)} loading={q.isLoading} erro={!!erro} />
        <Kpi label="Em andamento" value={String(emAndamento)} loading={q.isLoading} erro={!!erro} />
        <Kpi label="Aprovados" value={String(aprovados)} loading={q.isLoading} erro={!!erro}
          hint={`${taxaAprovacao.toFixed(0)}% de aprovação`} />
        <Kpi label="Valor previsto total" value={formatBRL(totalPipeline)} loading={q.isLoading} erro={!!erro} />
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Tabela `editais` indisponível ou sem permissão</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {ETAPAS.map((etapa) => {
            const items = porEtapa.get(etapa.key) ?? [];
            return (
              <div key={etapa.key} className="rounded-lg border bg-muted/30 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {etapa.label}
                  </div>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {q.isLoading ? (
                    <>
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </>
                  ) : items.length === 0 ? (
                    <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                      Sem editais
                    </div>
                  ) : (
                    items.map((r) => (
                      <EditalCard key={r.id} row={r} onOpen={() => setDetalheId(r.id)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId(null)}>
        {detalheId && projetoId ? (
          <EditalDetailDialog
            projetoId={projetoId}
            edital={rows.find((r) => r.id === detalheId) ?? null}
            onClose={() => setDetalheId(null)}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ["captacao", "editais", projetoId] });
            }}
            onDeleted={() => {
              qc.invalidateQueries({ queryKey: ["captacao", "editais", projetoId] });
              setDetalheId(null);
            }}
          />
        ) : null}
      </Dialog>
        </>
      )}
    </div>
  );
}

function Kpi({
  label, value, loading, erro, hint,
}: { label: string; value: string; loading: boolean; erro: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{loading ? "…" : erro ? "—" : value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function EditalCard({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const titulo = pickFirst(row, ["titulo", "nome"]) ?? "Sem título";
  const orgao = pickFirst(row, ["orgao", "orgao_financiador", "financiador"]);
  const responsavel = pickFirst(row, ["responsavel", "responsavel_nome"]);
  const prazo = pickFirst(row, ["prazo", "prazo_submissao", "data_limite"]);
  const valor = toNumber(row.valor_previsto);
  const dias = diasAte(prazo);
  const prazoTone =
    dias == null ? "text-muted-foreground"
      : dias < 0 ? "text-destructive"
      : dias <= 7 ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-md border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
    >
      <div className="line-clamp-2 text-sm font-medium leading-snug">{titulo}</div>
      {orgao ? (
        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{orgao}</div>
      ) : null}
      {valor > 0 ? (
        <div className="mt-1.5 text-xs font-medium text-foreground tabular-nums">{formatBRL(valor)}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {prazo ? (
          <span className={cn("inline-flex items-center gap-1", prazoTone)}>
            <CalendarDays className="h-3 w-3" />
            {formatarData(prazo)}
            {dias !== null ? (
              <span className="opacity-70">
                ({dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? "hoje" : `em ${dias}d`})
              </span>
            ) : null}
          </span>
        ) : null}
        {responsavel ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <User2 className="h-3 w-3" />
            {responsavel}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function EditalDetailDialog({
  projetoId, edital, onClose, onChanged, onDeleted,
}: {
  projetoId: string;
  edital: Row | null;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [novaNota, setNovaNota] = useState("");

  const histQ = useQuery(historicoEditalOptions(edital?.id ?? null));
  const historico = histQ.data?.rows ?? [];

  const mover = useMutation({
    mutationFn: (etapa: EtapaKey) => {
      if (!edital) throw new Error("Edital não encontrado.");
      return moverEtapa(edital, etapa);
    },
    onSuccess: () => {
      toast.success("Etapa atualizada.");
      onChanged();
      qc.invalidateQueries({ queryKey: ["captacao", "historico", edital?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNota = useMutation({
    mutationFn: () => {
      if (!edital) throw new Error("Edital não encontrado.");
      return registrarHistorico({ edital_id: edital.id, descricao: novaNota.trim() });
    },
    onSuccess: () => {
      toast.success("Nota registrada.");
      setNovaNota("");
      qc.invalidateQueries({ queryKey: ["captacao", "historico", edital?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: () => {
      if (!edital) throw new Error("Edital não encontrado.");
      return deleteEdital(edital.id);
    },
    onSuccess: () => {
      toast.success("Edital excluído.");
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!edital) return null;

  if (editando) {
    return (
      <EditalFormDialog
        projetoId={projetoId}
        edital={edital}
        onClose={() => setEditando(false)}
        onSaved={() => {
          onChanged();
          setEditando(false);
        }}
      />
    );
  }

  const titulo = pickFirst(edital, ["titulo", "nome"]) ?? "Sem título";
  const orgao = pickFirst(edital, ["orgao", "orgao_financiador", "financiador"]);
  const responsavel = pickFirst(edital, ["responsavel"]);
  const prazo = pickFirst(edital, ["prazo", "prazo_submissao", "data_limite"]);
  const link = pickFirst(edital, ["link", "url"]);
  const obs = pickFirst(edital, ["observacoes", "descricao"]);
  const valor = toNumber(edital.valor_previsto);
  const etapaAtual = String(edital.etapa ?? "identificado");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="pr-8">{titulo}</DialogTitle>
        <DialogDescription>{orgao ?? "Sem órgão financiador informado"}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</div>
            <div className="mt-0.5 font-medium tabular-nums">{valor > 0 ? formatBRL(valor) : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prazo</div>
            <div className="mt-0.5">{formatarData(prazo)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Responsável</div>
            <div className="mt-0.5">{responsavel ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Link</div>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <div className="mt-0.5 text-muted-foreground">—</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs">Etapa atual</Label>
          <Select
            value={etapaAtual}
            onValueChange={(v) => mover.mutate(v as EtapaKey)}
            disabled={mover.isPending}
          >
            <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ETAPAS.map((e) => (
                <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mover.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>

        {obs ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
            {obs}
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Histórico
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                placeholder="Adicionar nota ao histórico…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && novaNota.trim()) {
                    e.preventDefault();
                    addNota.mutate();
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => addNota.mutate()}
                disabled={!novaNota.trim() || addNota.isPending}
              >
                {addNota.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
              {histQ.isLoading ? (
                <>
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </>
              ) : histQ.data?.error ? (
                <div className="p-2 text-xs text-muted-foreground">
                  Tabela `editais_historico` indisponível ({histQ.data.error}).
                </div>
              ) : historico.length === 0 ? (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  Nenhum evento registrado.
                </div>
              ) : (
                historico.map((h) => (
                  <div key={h.id} className="rounded-md bg-muted/40 p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {String(h.evento ?? "") === "mudanca_etapa" ? (
                          <Badge variant="outline" className="mr-2 h-4 px-1 text-[10px]">
                            etapa
                          </Badge>
                        ) : null}
                        <span>{String(h.descricao ?? "—")}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatarData(String(h.created_at ?? ""))}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="justify-between sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmarExcluir(true)}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => setEditando(true)}>Editar</Button>
        </div>
      </DialogFooter>

      <AlertDialog open={confirmarExcluir} onOpenChange={setConfirmarExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir edital</AlertDialogTitle>
            <AlertDialogDescription>
              O histórico vinculado também poderá ser removido. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluir.mutate()} disabled={excluir.isPending}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  );
}

function EditalFormDialog({
  projetoId, edital, onClose, onSaved,
}: {
  projetoId: string;
  edital: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState(edital ? String(pickFirst(edital, ["titulo", "nome"]) ?? "") : "");
  const [orgao, setOrgao] = useState(edital ? String(pickFirst(edital, ["orgao", "orgao_financiador"]) ?? "") : "");
  const [valor, setValor] = useState(edital ? String(toNumber(edital.valor_previsto)) : "");
  const [prazo, setPrazo] = useState(edital ? String(edital.prazo ?? edital.prazo_submissao ?? "").slice(0, 10) : "");
  const [etapa, setEtapa] = useState<EtapaKey>(
    (edital ? (String(edital.etapa) as EtapaKey) : "identificado") as EtapaKey,
  );
  const [responsavel, setResponsavel] = useState(edital ? String(pickFirst(edital, ["responsavel"]) ?? "") : "");
  const [link, setLink] = useState(edital ? String(pickFirst(edital, ["link", "url"]) ?? "") : "");
  const [obs, setObs] = useState(edital ? String(pickFirst(edital, ["observacoes", "descricao"]) ?? "") : "");

  const salvar = useMutation({
    mutationFn: () =>
      upsertEdital({
        id: edital?.id,
        projeto_id: projetoId,
        titulo: titulo.trim(),
        orgao: orgao.trim() || null,
        valor_previsto: valor.trim() ? toNumber(valor) : null,
        prazo: prazo || null,
        etapa,
        responsavel: responsavel.trim() || null,
        link: link.trim() || null,
        observacoes: obs.trim() || null,
      }),
    onSuccess: () => {
      toast.success(edital ? "Edital atualizado." : "Edital criado.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeSalvar = titulo.trim().length >= 3;

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{edital ? "Editar edital" : "Novo edital"}</DialogTitle>
        <DialogDescription>
          Registre título, órgão, prazo e etapa. Você pode adicionar observações e link ao edital.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-titulo">Título</Label>
          <Input id="e-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-orgao">Órgão financiador</Label>
            <Input id="e-orgao" value={orgao} onChange={(e) => setOrgao(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-valor">Valor previsto (R$)</Label>
            <Input
              id="e-valor"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,-]/g, ""))}
              placeholder="0,00"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-prazo">Prazo de submissão</Label>
            <Input id="e-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Etapa</Label>
            <Select value={etapa} onValueChange={(v) => setEtapa(v as EtapaKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => (
                  <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-resp">Responsável</Label>
          <Input
            id="e-resp"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Nome do responsável"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-link">Link do edital</Label>
          <Input id="e-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-obs">Observações</Label>
          <Textarea id="e-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => salvar.mutate()} disabled={!podeSalvar || salvar.isPending}>
          {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// Marca `etapaLabel` como usado — deixe importado para tornar o pipeline
// facilmente extensível em outras views (não referenciado diretamente aqui).
void etapaLabel;