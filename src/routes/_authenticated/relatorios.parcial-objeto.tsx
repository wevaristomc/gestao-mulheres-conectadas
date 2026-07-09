import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2, Plus, RefreshCcw, Sparkles, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { useActiveContext } from "@/hooks/use-active-context";
import {
  SECOES_PARCIAL_OBJETO,
  formatarDataCurta,
  rascunhoParcialObjetoOptions,
  rascunhosPorProjetoOptions,
  statusClass,
  statusLabel,
  tituloRascunho,
  type RascunhoParcialObjeto,
  type SecaoKey,
} from "@/lib/relatorio-parcial-objeto-queries";
import {
  atualizarMetaParcialObjeto,
  atualizarSecaoParcialObjeto,
  criarRascunhoParcialObjeto,
  excluirRascunhoParcialObjeto,
  gerarSecaoParcialObjeto,
  regenerarContextoParcialObjeto,
} from "@/lib/relatorio-parcial-objeto.functions";

export const Route = createFileRoute("/_authenticated/relatorios/parcial-objeto")({
  head: () => ({
    meta: [{ title: "Relatório Parcial do Objeto · DEQ Item I" }],
  }),
  component: RelatorioParcialObjetoPage,
});

function RelatorioParcialObjetoPage() {
  const { projetoId, projetoNome } = useActiveContext();
  const queryClient = useQueryClient();
  const listaQuery = useQuery(rascunhosPorProjetoOptions(projetoId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [criarOpen, setCriarOpen] = useState(false);

  useEffect(() => {
    if (!selectedId && listaQuery.data?.rows?.length) {
      setSelectedId(listaQuery.data.rows[0].id);
    }
  }, [listaQuery.data, selectedId]);

  async function refetchAll(id?: string | null) {
    await queryClient.invalidateQueries({ queryKey: ["relatorios", "parcial-objeto"] });
    if (id) await queryClient.invalidateQueries({ queryKey: ["relatorios", "parcial-objeto", "item", id] });
  }

  return (
    <div>
      <PageHeader
        title="Relatório Parcial de Execução do Objeto"
        description={`DEQ_FISCAL — Item I. Projeto ativo: ${projetoNome ?? "—"}.`}
      />

      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Rascunho estruturado (Fase 3a).</strong> As seções são pré-preenchidas com resumos dos dados do banco (turmas, indicadores, evidências).
            A geração assistida por IA e a exportação DOCX vêm nas próximas rodadas. Revise sempre antes de enviar ao SEI/TransfereGov.
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Rascunhos deste projeto</div>
            <Dialog open={criarOpen} onOpenChange={setCriarOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" disabled={!projetoId}>
                  <Plus className="h-4 w-4" />
                  Novo
                </Button>
              </DialogTrigger>
              <CriarRascunhoDialog
                projetoId={projetoId}
                onCreated={async (id) => {
                  setSelectedId(id);
                  setCriarOpen(false);
                  await refetchAll(id);
                }}
              />
            </Dialog>
          </div>

          {listaQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : listaQuery.data?.error ? (
            <div className="text-xs text-destructive">{listaQuery.data.error}</div>
          ) : (listaQuery.data?.rows ?? []).length === 0 ? (
            <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
              Nenhum rascunho ainda. Clique em <strong>Novo</strong> para gerar o primeiro a partir dos dados do projeto.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {(listaQuery.data?.rows ?? []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={
                      "w-full rounded border p-2 text-left text-xs transition-colors " +
                      (selectedId === r.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50")
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate font-medium">{tituloRascunho(r)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={`rounded px-1 py-0.5 font-medium ${statusClass(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                      <span>atualizado {formatarDataCurta(r.atualizado_em)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {selectedId ? (
            <EditorRascunho id={selectedId} onDeleted={async () => { setSelectedId(null); await refetchAll(); }} />
          ) : (
            <div className="rounded border border-dashed p-6 text-sm text-muted-foreground">
              Selecione um rascunho à esquerda ou crie um novo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CriarRascunhoDialog({
  projetoId,
  onCreated,
}: {
  projetoId: string | null;
  onCreated: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [ciclo, setCiclo] = useState<string>("");
  const [ini, setIni] = useState<string>("");
  const [fim, setFim] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!projetoId) return;
    setLoading(true);
    try {
      const res = await criarRascunhoParcialObjeto({
        data: {
          projetoId,
          titulo: titulo.trim() || null,
          ciclo: ciclo ? Number(ciclo) : null,
          periodoInicio: ini || null,
          periodoFim: fim || null,
        },
      });
      toast.success("Rascunho criado a partir dos dados do projeto.");
      onCreated((res.row as { id: string }).id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo rascunho parcial do objeto</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="titulo">Título (opcional)</Label>
          <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: 1º parcial 2026 — Ciclo 1" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="ciclo">Ciclo</Label>
            <Input id="ciclo" type="number" value={ciclo} onChange={(e) => setCiclo(e.target.value)} placeholder="1" />
          </div>
          <div>
            <Label htmlFor="ini">Início</Label>
            <Input id="ini" type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fim">Fim</Label>
            <Input id="fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Ao criar, o sistema monta o contexto a partir das views MTE e da tabela de evidências, e pré-preenche as 8 seções do modelo oficial.
        </p>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={!projetoId || loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Gerar rascunho
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditorRascunho({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const itemQuery = useQuery(rascunhoParcialObjetoOptions(id));
  const row = itemQuery.data?.row ?? null;

  if (itemQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando rascunho…
      </div>
    );
  }

  if (itemQuery.data?.error) {
    return <div className="text-sm text-destructive">{itemQuery.data.error}</div>;
  }

  if (!row) {
    return <div className="text-sm text-muted-foreground">Rascunho não encontrado.</div>;
  }

  return <EditorRascunhoInner row={row} onDeleted={onDeleted} onInvalidate={async () => {
    await queryClient.invalidateQueries({ queryKey: ["relatorios", "parcial-objeto"] });
  }} />;
}

function EditorRascunhoInner({
  row,
  onDeleted,
  onInvalidate,
}: {
  row: RascunhoParcialObjeto;
  onDeleted: () => void;
  onInvalidate: () => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(row.titulo ?? "");
  const [ciclo, setCiclo] = useState<string>(row.ciclo != null ? String(row.ciclo) : "");
  const [ini, setIni] = useState<string>(row.periodo_inicio ?? "");
  const [fim, setFim] = useState<string>(row.periodo_fim ?? "");
  const [status, setStatus] = useState<RascunhoParcialObjeto["status"]>(row.status);
  const [regenerando, setRegenerando] = useState(false);

  async function salvarMeta() {
    try {
      await atualizarMetaParcialObjeto({
        data: {
          id: row.id,
          titulo: titulo || null,
          ciclo: ciclo ? Number(ciclo) : null,
          periodoInicio: ini || null,
          periodoFim: fim || null,
          status,
        },
      });
      toast.success("Cabeçalho atualizado.");
      await onInvalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function regenerarContexto() {
    setRegenerando(true);
    try {
      await regenerarContextoParcialObjeto({ data: { id: row.id } });
      toast.success("Contexto atualizado com os dados mais recentes. Seções vazias foram repovoadas.");
      await onInvalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerando(false);
    }
  }

  async function excluir() {
    if (!window.confirm("Excluir este rascunho? A ação não pode ser desfeita.")) return;
    try {
      await excluirRascunhoParcialObjeto({ data: { id: row.id } });
      toast.success("Rascunho excluído.");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="titulo-ed">Título</Label>
            <Input id="titulo-ed" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ciclo-ed">Ciclo</Label>
            <Input id="ciclo-ed" type="number" value={ciclo} onChange={(e) => setCiclo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="status-ed">Status</Label>
            <select
              id="status-ed"
              value={status}
              onChange={(e) => setStatus(e.target.value as RascunhoParcialObjeto["status"])}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="rascunho">Rascunho</option>
              <option value="revisado">Revisado</option>
              <option value="exportado">Exportado</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ini-ed">Início</Label>
            <Input id="ini-ed" type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fim-ed">Fim</Label>
            <Input id="fim-ed" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={salvarMeta}>Salvar cabeçalho</Button>
          <Button size="sm" variant="outline" onClick={regenerarContexto} disabled={regenerando} className="gap-1.5">
            {regenerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Recalcular contexto (preserva textos editados)
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive gap-1.5" onClick={excluir}>
            <Trash2 className="h-4 w-4" />
            Excluir rascunho
          </Button>
        </div>
      </div>

      <ResumoContexto contexto={row.contexto as Record<string, unknown>} />

      <div className="space-y-3">
        {SECOES_PARCIAL_OBJETO.map((s) => (
          <SecaoEditor key={s.key} rascunhoId={row.id} secao={s.key as SecaoKey} label={s.label} descricao={s.descricao} valorInicial={(row.secoes[s.key]?.texto as string | undefined) ?? ""} onSaved={onInvalidate} />
        ))}
      </div>
    </div>
  );
}

function ResumoContexto({ contexto }: { contexto: Record<string, unknown> }) {
  const ctx = contexto as any;
  if (!ctx || Object.keys(ctx).length === 0) return null;
  const turmas = ctx.turmas?.total ?? 0;
  const cursos = ctx.cursos_executados ?? {};
  const cons = ctx.consolidacao ?? {};
  const ev = ctx.evidencias ?? {};
  const pmq = ctx.checklist_pmq ?? {};
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs">
      <div className="font-medium mb-1">Snapshot do contexto (dados brutos usados na pré-redação)</div>
      <div className="grid gap-1.5 md:grid-cols-4">
        <span>Turmas: <strong>{turmas}</strong></span>
        <span>Matriculadas: <strong>{cursos.matriculadas ?? 0}</strong></span>
        <span>Concluintes: <strong>{cursos.concluintes ?? 0}</strong></span>
        <span>Evadidas: <strong>{cursos.evadidas ?? 0}</strong></span>
        <span>Certificados: <strong>{cons.certificados ?? 0}</strong></span>
        <span>Freq. média: <strong>{cons.freq_media != null ? `${cons.freq_media}%` : "—"}</strong></span>
        <span>Evidências: <strong>{ev.total ?? 0}</strong></span>
        <span>PMQ ok/pendente: <strong>{pmq.itens_ok ?? 0}/{pmq.itens_pendentes ?? 0}</strong></span>
      </div>
    </div>
  );
}

function SecaoEditor({
  rascunhoId,
  secao,
  label,
  descricao,
  valorInicial,
  onSaved,
}: {
  rascunhoId: string;
  secao: SecaoKey;
  label: string;
  descricao: string;
  valorInicial: string;
  onSaved: () => Promise<void>;
}) {
  const [texto, setTexto] = useState(valorInicial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lastSaved = useRef(valorInicial);

  useEffect(() => {
    setTexto(valorInicial);
    lastSaved.current = valorInicial;
    setDirty(false);
  }, [valorInicial]);

  // Autosave com debounce de 1.5s a partir da última edição.
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(async () => {
      if (texto === lastSaved.current) return;
      setSaving(true);
      try {
        await atualizarSecaoParcialObjeto({ data: { id: rascunhoId, secao, texto } });
        lastSaved.current = texto;
        setDirty(false);
        await onSaved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [texto, dirty, rascunhoId, secao, onSaved]);

  const contador = useMemo(() => `${texto.length.toLocaleString("pt-BR")} caracteres`, [texto]);

  const [iaOpen, setIaOpen] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaInstrucao, setIaInstrucao] = useState("");
  const [iaResultado, setIaResultado] = useState<null | {
    texto: string;
    provedor: string | null;
    modelo: string | null;
    fallback_de: string | null;
    citacoes: { ref: string; titulo: string | null; similarity: number }[];
    aviso: string;
  }>(null);

  async function gerarComIA() {
    setIaLoading(true);
    setIaResultado(null);
    try {
      const res = await gerarSecaoParcialObjeto({
        data: { id: rascunhoId, secao, instrucaoExtra: iaInstrucao.trim() || undefined },
      });
      setIaResultado({
        texto: (res as { texto: string }).texto,
        provedor: (res as { provedor: string | null }).provedor ?? null,
        modelo: (res as { modelo: string | null }).modelo ?? null,
        fallback_de: (res as { fallback_de: string | null }).fallback_de ?? null,
        citacoes: (res as { citacoes: { ref: string; titulo: string | null; similarity: number }[] }).citacoes ?? [],
        aviso: (res as { aviso: string }).aviso ?? "Gerado por IA — revisar antes de enviar ao SEI/TransfereGov.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setIaLoading(false);
    }
  }

  function aplicar(modo: "substituir" | "anexar") {
    if (!iaResultado) return;
    const proposto = iaResultado.texto.trim();
    if (!proposto) {
      toast.error("Proposta vazia — nada para aplicar.");
      return;
    }
    const novo = modo === "substituir" ? proposto : `${texto.trim()}\n\n${proposto}`.trim();
    setTexto(novo);
    setDirty(true);
    setIaOpen(false);
    setIaResultado(null);
    toast.success("Proposta aplicada — lembre-se de revisar antes de enviar ao SEI/TransfereGov.");
  }

  return (
    <details className="rounded-lg border bg-card" open>
      <summary className="cursor-pointer list-none p-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{descricao}</div>
        </div>
        <div className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
          {saving ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> salvando…</span>
          ) : dirty ? (
            <span>não salvo</span>
          ) : (
            <span>salvo</span>
          )}
        </div>
      </summary>
      <div className="border-t p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={iaOpen} onOpenChange={(o) => { setIaOpen(o); if (!o) setIaResultado(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Gerar rascunho com IA
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Gerar rascunho com IA — {label}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Rascunho gerado por IA — revisar antes de enviar ao SEI/TransfereGov.</strong> A IA usa os dados do contexto estruturado e trechos da Base de Conhecimento do projeto; cita como <code>[Doc N]</code>. Números fora desse contexto são marcados como <code>[preencher: …]</code>.
                    </span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="ia-instr" className="text-xs">Instrução adicional (opcional)</Label>
                  <Textarea
                    id="ia-instr"
                    value={iaInstrucao}
                    onChange={(e) => setIaInstrucao(e.target.value)}
                    rows={2}
                    placeholder="Ex: destaque as parcerias com CRAS de Cariacica; foque no ciclo 1."
                  />
                </div>
                {!iaResultado ? (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={gerarComIA} disabled={iaLoading} className="gap-1.5">
                      {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Gerar proposta
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-[10px] text-muted-foreground">
                      Provedor: <strong>{iaResultado.provedor ?? "—"}</strong>
                      {iaResultado.modelo ? ` · Modelo: ${iaResultado.modelo}` : ""}
                      {iaResultado.fallback_de ? ` · Fallback de: ${iaResultado.fallback_de}` : ""}
                    </div>
                    <Textarea
                      value={iaResultado.texto}
                      onChange={(e) => setIaResultado({ ...iaResultado, texto: e.target.value })}
                      rows={14}
                      className="font-mono text-xs"
                    />
                    {iaResultado.citacoes.length > 0 && (
                      <div className="rounded border bg-muted/30 p-2 text-[11px]">
                        <div className="font-medium mb-1">Citações usadas na geração:</div>
                        <ul className="space-y-0.5">
                          {iaResultado.citacoes.map((c) => (
                            <li key={c.ref}>
                              <strong>{c.ref}:</strong> {c.titulo ?? "(sem título)"} — similaridade {(c.similarity * 100).toFixed(0)}%
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setIaResultado(null)}>Descartar e gerar de novo</Button>
                      <Button size="sm" variant="outline" onClick={() => aplicar("anexar")}>Anexar ao final</Button>
                      <Button size="sm" onClick={() => aplicar("substituir")}>Substituir seção</Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <Textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setDirty(true);
          }}
          rows={12}
          className="font-mono text-xs"
          placeholder="Escreva o conteúdo desta seção. Aceita Markdown."
        />
        <div className="text-[10px] text-muted-foreground">{contador} · autosalvamento em 1,5s após parar de digitar.</div>
      </div>
    </details>
  );
}