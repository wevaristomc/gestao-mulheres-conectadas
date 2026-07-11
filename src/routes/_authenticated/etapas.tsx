import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  etapasListOptions, atividadesByEtapaOptions,
  toggleAtividade, upsertAtividade, deleteAtividade,
  progresso, isAtrasada, etapaAtual, moduleLink,
  ETAPA_STATUS_LABEL, ATIV_STATUS_LABEL,
  type Etapa, type Atividade, type AtividadeStatus,
} from "@/lib/etapas-queries";

export const Route = createFileRoute("/_authenticated/etapas")({
  head: () => ({ meta: [{ title: "Etapas do Projeto · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("etapas"),
  component: EtapasPage,
});

const COORD_ROLES = new Set([
  "coordenador_geral", "administrativo", "coordenador_pedagogico",
]);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function etapaBadge(status: Etapa["status"]) {
  const map = {
    planejada: "secondary",
    em_andamento: "default",
    concluida: "outline",
    prestacao_contas: "destructive",
  } as const;
  return <Badge variant={map[status]}>{ETAPA_STATUS_LABEL[status]}</Badge>;
}

function EtapasPage() {
  const { projetoId, role, user } = useActiveContext();
  const canEdit = role ? COORD_ROLES.has(role) : false;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = useQuery(etapasListOptions(projetoId));
  const etapas = q.data?.rows ?? [];
  const selectedEtapa = useMemo(() => {
    if (selectedId) return etapas.find((e) => e.id === selectedId) ?? null;
    return etapaAtual(etapas);
  }, [etapas, selectedId]);

  return (
    <div>
      <PageHeader
        title="Etapas do Projeto"
        description="Planejamento, execução e prestação de contas por etapa."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {etapas.map((e) => (
          <EtapaCard
            key={e.id}
            etapa={e}
            active={selectedEtapa?.id === e.id}
            onSelect={() => setSelectedId(e.id)}
          />
        ))}
        {q.isLoading && (
          <div className="text-sm text-muted-foreground">Carregando etapas…</div>
        )}
        {!q.isLoading && etapas.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Nenhuma etapa cadastrada. Aplique a migração <code>etapas.sql</code>.
          </div>
        )}
      </div>

      {selectedEtapa && (
        <EtapaDetalhe
          etapa={selectedEtapa}
          canEdit={canEdit}
          userId={user?.id ?? null}
        />
      )}
    </div>
  );
}

function EtapaCard({
  etapa, active, onSelect,
}: { etapa: Etapa; active: boolean; onSelect: () => void }) {
  const q = useQuery(atividadesByEtapaOptions(etapa.id));
  const rows = q.data?.rows ?? [];
  const p = progresso(rows);
  return (
    <Card
      className={cn("cursor-pointer transition-colors", active && "border-primary")}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">
            {etapa.numero}. {etapa.titulo}
          </CardTitle>
          {etapaBadge(etapa.status)}
        </div>
        <div className="text-xs text-muted-foreground">
          {fmtDate(etapa.data_inicio)} — {fmtDate(etapa.data_fim)}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={p.pct} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{p.concluidas} de {p.total} atividades</span>
          <span className="font-medium text-foreground">{p.pct}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EtapaDetalhe({
  etapa, canEdit, userId,
}: { etapa: Etapa; canEdit: boolean; userId: string | null }) {
  const qc = useQueryClient();
  const q = useQuery(atividadesByEtapaOptions(etapa.id));
  const rows = q.data?.rows ?? [];

  const [filtroStatus, setFiltroStatus] = useState<string>("all");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Atividade | null>(null);

  const grupos = useMemo(() => {
    const seen = new Map<string, Atividade[]>();
    for (const a of rows) {
      if (filtroStatus !== "all" && a.status !== filtroStatus) continue;
      if (filtroGrupo !== "all" && a.grupo !== filtroGrupo) continue;
      if (!seen.has(a.grupo)) seen.set(a.grupo, []);
      seen.get(a.grupo)!.push(a);
    }
    return Array.from(seen.entries());
  }, [rows, filtroStatus, filtroGrupo]);

  const gruposDisponiveis = useMemo(
    () => Array.from(new Set(rows.map((a) => a.grupo))),
    [rows],
  );

  const toggle = useMutation({
    mutationFn: async (v: { id: string; concluida: boolean }) => {
      const status: AtividadeStatus = v.concluida ? "concluida" : "pendente";
      await toggleAtividade(v.id, status, userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["etapas"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => deleteAtividade(id),
    onSuccess: () => {
      toast.success("Atividade removida");
      qc.invalidateQueries({ queryKey: ["etapas"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pTotal = progresso(rows);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">
              Etapa {etapa.numero} — {etapa.titulo}
            </CardTitle>
            {etapa.descricao && (
              <p className="mt-1 text-sm text-muted-foreground">{etapa.descricao}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {etapaBadge(etapa.status)}
            {canEdit && (
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> Atividade
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{fmtDate(etapa.data_inicio)} — {fmtDate(etapa.data_fim)}</span>
          <span>·</span>
          <span>{pTotal.concluidas}/{pTotal.total} concluídas ({pTotal.pct}%)</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="bloqueada">Bloqueada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
            <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {gruposDisponiveis.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando atividades…</div>
        ) : grupos.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma atividade encontrada.</div>
        ) : (
          <Accordion type="multiple" defaultValue={grupos.map(([g]) => g)}>
            {grupos.map(([grupo, atividades]) => {
              const p = progresso(atividades);
              return (
                <AccordionItem key={grupo} value={grupo}>
                  <AccordionTrigger>
                    <div className="flex flex-1 items-center justify-between pr-3">
                      <span className="font-medium">{grupo}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.concluidas}/{p.total} · {p.pct}%
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="mb-2"><Progress value={p.pct} /></div>
                    <ul className="divide-y">
                      {atividades.map((a) => (
                        <AtividadeRow
                          key={a.id}
                          atividade={a}
                          canEdit={canEdit}
                          onToggle={(c) => toggle.mutate({ id: a.id, concluida: c })}
                          onEdit={() => { setEditing(a); setDialogOpen(true); }}
                          onDelete={() => {
                            if (confirm(`Remover "${a.titulo}"?`)) remover.mutate(a.id);
                          }}
                        />
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>

      <AtividadeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        etapaId={etapa.id}
        editing={editing}
        gruposConhecidos={gruposDisponiveis}
        onSaved={() => qc.invalidateQueries({ queryKey: ["etapas"] })}
      />
    </Card>
  );
}

function AtividadeRow({
  atividade, canEdit, onToggle, onEdit, onDelete,
}: {
  atividade: Atividade;
  canEdit: boolean;
  onToggle: (c: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const atrasada = isAtrasada(atividade);
  const link = moduleLink(atividade.vinculo_modulo);
  const concluida = atividade.status === "concluida";
  return (
    <li className="flex items-start gap-3 py-2">
      <Checkbox
        checked={concluida}
        onCheckedChange={(c) => onToggle(!!c)}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm", concluida && "line-through text-muted-foreground")}>
            {atividade.titulo}
          </span>
          {atividade.status !== "pendente" && atividade.status !== "concluida" && (
            <Badge variant="secondary" className="text-[10px]">
              {ATIV_STATUS_LABEL[atividade.status]}
            </Badge>
          )}
          {atrasada && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="mr-1 h-3 w-3" /> Atrasada
            </Badge>
          )}
        </div>
        {atividade.descricao && (
          <p className="mt-0.5 text-xs text-muted-foreground">{atividade.descricao}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {atividade.prazo && (
            <span className={cn("inline-flex items-center gap-1", atrasada && "text-destructive")}>
              <Clock className="h-3 w-3" /> {fmtDate(atividade.prazo)}
            </span>
          )}
          {atividade.responsavel && <span>Resp.: {atividade.responsavel}</span>}
          {link && (
            <Link
              to={link.to}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> {link.label}
            </Link>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </li>
  );
}

function AtividadeDialog({
  open, onOpenChange, etapaId, editing, gruposConhecidos, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  etapaId: string;
  editing: Atividade | null;
  gruposConhecidos: string[];
  onSaved: () => void;
}) {
  const [grupo, setGrupo] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");
  const [vinculo, setVinculo] = useState<string>("nenhum");

  useMemo(() => {
    if (open) {
      setGrupo(editing?.grupo ?? gruposConhecidos[0] ?? "");
      setTitulo(editing?.titulo ?? "");
      setDescricao(editing?.descricao ?? "");
      setResponsavel(editing?.responsavel ?? "");
      setPrazo(editing?.prazo ?? "");
      setVinculo(editing?.vinculo_modulo ?? "nenhum");
    }
  }, [open, editing, gruposConhecidos]);

  const save = useMutation({
    mutationFn: async () => {
      if (!grupo.trim() || !titulo.trim()) throw new Error("Grupo e título são obrigatórios.");
      await upsertAtividade({
        id: editing?.id,
        etapa_id: etapaId,
        grupo: grupo.trim(),
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        responsavel: responsavel.trim() || null,
        prazo: prazo || null,
        vinculo_modulo: vinculo === "nenhum" ? null : vinculo,
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Atividade atualizada" : "Atividade criada");
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar atividade" : "Nova atividade"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Grupo</Label>
            <Input value={grupo} onChange={(e) => setGrupo(e.target.value)}
              placeholder="Ex.: Administração, AVA, Matrículas" list="grupos-etapa" />
            <datalist id="grupos-etapa">
              {gruposConhecidos.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="grid gap-1">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Responsável</Label>
              <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Prazo</Label>
              <Input type="date" value={prazo ?? ""} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Vínculo com módulo</Label>
            <Select value={vinculo} onValueChange={setVinculo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum</SelectItem>
                <SelectItem value="cotacoes">Cotações (Financeiro)</SelectItem>
                <SelectItem value="ava">AVA</SelectItem>
                <SelectItem value="pendencias">Pendências</SelectItem>
                <SelectItem value="locais">Locais</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export helpers used by the dashboard card
export { CheckCircle2, Circle };