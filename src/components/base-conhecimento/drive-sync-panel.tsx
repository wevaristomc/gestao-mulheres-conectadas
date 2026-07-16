import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle, CheckCircle2, Clock, Film, HardDrive, Loader2, RefreshCw, Search, Video,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatarData } from "@/lib/base-conhecimento-queries";
import {
  driveSyncLista, driveSyncMarcarTranscricao, driveSyncProcessar,
  driveSyncReindexar, driveSyncStatus, driveSyncTentarAgora, driveSyncVarredura,
} from "@/lib/drive-sync.functions";

type Arquivo = {
  id: string;
  gdrive_id: string;
  nome: string;
  mime_type: string | null;
  tamanho: number | null;
  modified_time: string | null;
  pasta_caminho: string | null;
  tipo: string;
  status: string;
  transcrever: boolean;
  erro: string | null;
  processado_em: string | null;
  atualizado_em: string | null;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  processando: { label: "Processando…", variant: "secondary" },
  indexado: { label: "Indexado", variant: "default" },
  erro: { label: "Erro", variant: "destructive" },
  ignorado: { label: "Ignorado", variant: "outline" },
  aguardando_selecao: { label: "Aguardando seleção", variant: "outline" },
};

const TIPOS = ["texto", "pdf", "docx", "planilha", "imagem", "audio", "video", "gdoc", "outro"];

function bytesFmt(n: number | null | undefined): string {
  if (!n) return "—";
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function DriveSyncPanel({ projetoId }: { projetoId: string | null }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(driveSyncStatus);
  const listaFn = useServerFn(driveSyncLista);
  const varreduraFn = useServerFn(driveSyncVarredura);
  const processarFn = useServerFn(driveSyncProcessar);
  const marcarFn = useServerFn(driveSyncMarcarTranscricao);
  const reindexFn = useServerFn(driveSyncReindexar);
  const tentarAgoraFn = useServerFn(driveSyncTentarAgora);

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [progresso, setProgresso] = useState<{
    fase: "varredura" | "processamento" | "concluido";
    done: number;
    total: number;
    restantes: number;
    mensagem: string;
  } | null>(null);
  const [videosSelecionados, setVideosSelecionados] = useState<Set<string>>(new Set());

  const statusQ = useQuery({
    queryKey: ["drive-sync-status"],
    queryFn: () => statusFn(),
    refetchInterval: 15000,
  });

  const listaQ = useQuery({
    queryKey: ["drive-sync-lista", filtroStatus, filtroTipo, busca],
    queryFn: () => listaFn({
      data: {
        status: filtroStatus === "todos" ? null : filtroStatus,
        tipo: filtroTipo === "todos" ? null : filtroTipo,
        busca: busca.trim() || null,
        limit: 300,
      },
    }),
  });

  const arquivos: Arquivo[] = (listaQ.data?.rows as Arquivo[] | undefined) ?? [];
  const aguardando = useMemo(() => arquivos.filter((a) => a.status === "aguardando_selecao"), [arquivos]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!projetoId) throw new Error("Selecione um projeto ativo.");
      setProgresso({ fase: "varredura", done: 0, total: 0, restantes: 0, mensagem: "Varrendo o Drive…" });
      const r = await varreduraFn();
      const total = r.total ?? 0;
      setProgresso({
        fase: "processamento",
        done: 0,
        total,
        restantes: total,
        mensagem: `${total} arquivos catalogados. Processando fila…`,
      });
      let done = 0;
      let cotaAvisada = false;
      for (let i = 0; i < 10; i += 1) {
        const p = await processarFn({ data: { projetoId } });
        done += p.processados + p.ignorados + p.erros;
        if (!cotaAvisada && (p.aguardandoRetry ?? 0) > 0) {
          toast.info(
            `Cota de IA esgotada em ${p.aguardandoRetry} arquivo(s) — nova tentativa automática em ~2h.`,
          );
          cotaAvisada = true;
        }
        setProgresso({
          fase: "processamento",
          done,
          total: Math.max(total, done + p.restantes),
          restantes: p.restantes,
          mensagem: `Processados ${done} · restam ${p.restantes}`,
        });
        if (p.restantes === 0) break;
        await new Promise((res) => setTimeout(res, 400));
      }
      setProgresso({
        fase: "concluido",
        done,
        total: Math.max(total, done),
        restantes: 0,
        mensagem: "Sincronização concluída",
      });
      return { done };
    },
    onSuccess: (r) => {
      toast.success(`Sincronização concluída (${r.done} arquivos processados)`);
      qc.invalidateQueries({ queryKey: ["drive-sync-status"] });
      qc.invalidateQueries({ queryKey: ["drive-sync-lista"] });
      if (projetoId) qc.invalidateQueries({ queryKey: ["base-conhecimento", "documentos", projetoId] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Falha na sincronização");
    },
  });

  const tentarAgora = useMutation({
    mutationFn: () => tentarAgoraFn(),
    onSuccess: (r) => {
      toast.success(`Backoff removido de ${r.liberados ?? 0} arquivo(s). Rode "Sincronizar agora".`);
      qc.invalidateQueries({ queryKey: ["drive-sync-status"] });
      qc.invalidateQueries({ queryKey: ["drive-sync-lista"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha"),
  });

  const isSyncing = syncMutation.isPending;
  const syncError = syncMutation.error instanceof Error ? syncMutation.error.message : null;

  function rodarSincronizacao() {
    if (isSyncing) return;
    syncMutation.reset();
    syncMutation.mutate();
  }

  // Auto-sync (1x a cada 6h) — dispara em background ao abrir a tela.
  useEffect(() => {
    if (!projetoId) return;
    if (!statusQ.data) return;
    if (isSyncing) return;
    const ultima = statusQ.data.estado?.ultima_varredura ? new Date(statusQ.data.estado.ultima_varredura).getTime() : 0;
    const seisHoras = 6 * 60 * 60 * 1000;
    if (Date.now() - ultima < seisHoras) return;
    // dispara silenciosamente
    (async () => {
      try {
        await varreduraFn();
        await processarFn({ data: { projetoId } });
        toast.success("Base de conhecimento atualizada com novos arquivos do Drive");
        qc.invalidateQueries({ queryKey: ["drive-sync-status"] });
        qc.invalidateQueries({ queryKey: ["drive-sync-lista"] });
      } catch {
        // silencioso — banner de erro já mostra falhas
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId, statusQ.data?.estado?.ultima_varredura, isSyncing]);

  const marcarVideos = useMutation({
    mutationFn: (ids: string[]) => marcarFn({ data: { ids } }),
    onSuccess: () => {
      toast.success("Vídeos marcados para transcrição");
      setVideosSelecionados(new Set());
      qc.invalidateQueries({ queryKey: ["drive-sync-lista"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao marcar"),
  });

  const reindex = useMutation({
    mutationFn: (id: string) => reindexFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Reindexação enfileirada");
      qc.invalidateQueries({ queryKey: ["drive-sync-lista"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao reindexar"),
  });

  const cs = statusQ.data?.contadoresStatus ?? {};
  const ct = statusQ.data?.contadoresTipo ?? {};

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">Sincronização com Google Drive</div>
          {statusQ.data?.rootConfigured ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <CheckCircle2 className="h-3 w-3" /> Pasta raiz configurada
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertCircle className="h-3 w-3" /> GDRIVE_ROOT_FOLDER_ID ausente
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={rodarSincronizacao} disabled={!projetoId || isSyncing}>
              {isSyncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              {isSyncing ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          </div>
        </div>
        {progresso && (isSyncing || progresso.fase !== "concluido") ? (
          <div className="mb-3 rounded-md border bg-muted/40 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{progresso.mensagem}</span>
            </div>
            <Progress
              value={progresso.total > 0 ? Math.min(100, (progresso.done / progresso.total) * 100) : (isSyncing ? 8 : 0)}
              className="h-2"
            />
          </div>
        ) : null}
        {syncError ? (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="mb-0.5 flex items-center gap-1.5 font-medium">
              <AlertCircle className="h-3.5 w-3.5" /> Falha na sincronização
            </div>
            <div className="whitespace-pre-wrap break-words">{syncError}</div>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Indexados" value={String(cs.indexado ?? 0)} />
          <Kpi
            label="Pendentes"
            value={String(Math.max(0, (cs.pendente ?? 0) + (cs.processando ?? 0) - (statusQ.data?.aguardandoRetry ?? 0)))}
          />
          <Kpi label="Erros" value={String(cs.erro ?? 0)} />
          <Kpi label="Vídeos aguardando" value={String(cs.aguardando_selecao ?? 0)} />
        </div>
        {(statusQ.data?.aguardandoRetry ?? 0) > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>
              <strong>{statusQ.data?.aguardandoRetry}</strong> arquivo(s) aguardando nova tentativa (cota de IA).
              {statusQ.data?.proximaTentativa ? (
                <> Próxima tentativa: <strong>{formatarData(statusQ.data.proximaTentativa)}</strong>.</>
              ) : null}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7"
              onClick={() => tentarAgora.mutate()}
              disabled={tentarAgora.isPending}
            >
              {tentarAgora.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Tentar agora
            </Button>
          </div>
        ) : null}
        <div className="mt-3 text-xs text-muted-foreground">
          Última varredura: {statusQ.data?.estado?.ultima_varredura ? formatarData(statusQ.data.estado.ultima_varredura) : "—"}
          {" · "}
          Por tipo: {TIPOS.map((t) => `${t}:${ct[t] ?? 0}`).join(" · ")}
        </div>
      </div>

      {aguardando.length > 0 ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-medium">Vídeos aguardando seleção — transcrição sob demanda</div>
            <Button
              size="sm"
              className="ml-auto"
              disabled={videosSelecionados.size === 0 || marcarVideos.isPending}
              onClick={() => marcarVideos.mutate(Array.from(videosSelecionados))}
            >
              {marcarVideos.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Film className="mr-1.5 h-4 w-4" />}
              Transcrever selecionados ({videosSelecionados.size})
            </Button>
          </div>
          <div className="grid gap-1.5">
            {aguardando.slice(0, 25).map((v) => (
              <label key={v.id} className="flex items-start gap-2 rounded border bg-background p-2 text-sm">
                <Checkbox
                  checked={videosSelecionados.has(v.id)}
                  onCheckedChange={(c) => setVideosSelecionados((prev) => {
                    const next = new Set(prev);
                    if (c) next.add(v.id); else next.delete(v.id);
                    return next;
                  })}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{v.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {v.pasta_caminho ?? "/"} · {bytesFmt(v.tamanho)}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nome ou pasta…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {TIPOS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arquivo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Modificado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listaQ.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : arquivos.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                Nenhum arquivo. Clique em "Sincronizar agora" para varrer o Drive.
              </TableCell></TableRow>
            ) : arquivos.map((a) => {
              const st = STATUS_LABEL[a.status] ?? STATUS_LABEL.pendente;
              return (
                <TableRow key={a.id}>
                  <TableCell className="max-w-[420px]">
                    <div className="truncate font-medium">{a.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.pasta_caminho ?? "/"}</div>
                    {a.erro ? <div className="mt-1 truncate text-xs text-destructive">⚠ {a.erro}</div> : null}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{a.tipo}</Badge></TableCell>
                  <TableCell><Badge variant={st.variant} className="text-[10px]">{st.label}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{bytesFmt(a.tamanho)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatarData(a.modified_time)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm" variant="ghost" title="Reindexar"
                      onClick={() => reindex.mutate(a.id)}
                      disabled={reindex.isPending || a.status === "processando"}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{value}</div>
    </div>
  );
}