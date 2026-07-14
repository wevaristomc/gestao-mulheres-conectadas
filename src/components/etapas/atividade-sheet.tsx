import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ExternalLink, MessageCircle, Send, Sparkles } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  comentariosOptions,
  adicionarComentario,
  atualizarKanban,
  upsertAtividade,
  type Atividade,
  type Prioridade,
} from "@/lib/etapas-queries";
import { atribuirResponsavel, listarUsuariosParaDemandas } from "@/lib/demandas.functions";
import { moduleLink } from "@/lib/etapas-queries";
import { GuiaPanel } from "./guia-panel";
import {
  PRIORIDADE_COR,
  PRIORIDADE_LABEL,
  corDoGrupo,
  formatarPrazoCard,
  iniciais,
  isAtrasadaAtiv,
} from "./demanda-utils";

type UserLite = { id: string; nome: string; email: string; role: string };

export function AtividadeSheet({
  atividade,
  open,
  onOpenChange,
  canEdit,
  currentUserId,
  projetoId,
}: {
  atividade: Atividade | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canEdit: boolean;
  currentUserId: string | null;
  projetoId: string | null;
}) {
  const qc = useQueryClient();
  const link = atividade ? moduleLink(atividade.vinculo_modulo) : null;
  const [novoComentario, setNovoComentario] = useState("");
  const [guiaAberto, setGuiaAberto] = useState(false);

  const listarUsersFn = useServerFn(listarUsuariosParaDemandas);
  const atribuirFn = useServerFn(atribuirResponsavel);

  const usersQ = useQuery({
    queryKey: ["demandas-users", projetoId],
    enabled: open && !!projetoId,
    staleTime: 60_000,
    queryFn: async (): Promise<UserLite[]> => {
      if (!projetoId) return [];
      return listarUsersFn({ data: { projetoId } }) as Promise<UserLite[]>;
    },
  });
  const users = usersQ.data ?? [];
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const comentQ = useQuery(comentariosOptions(atividade?.id ?? null));
  const comentarios = comentQ.data ?? [];

  const isMine =
    !!currentUserId &&
    !!atividade &&
    (atividade.responsavel_id === currentUserId ||
      atividade.colaboradores.includes(currentUserId));
  const podeInteragir = canEdit || isMine;

  const salvarBase = useMutation({
    mutationFn: async (patch: Partial<Atividade> & { id: string }) => {
      if (!atividade) return;
      await upsertAtividade({
        id: patch.id,
        etapa_id: atividade.etapa_id,
        grupo: patch.grupo ?? atividade.grupo,
        titulo: patch.titulo ?? atividade.titulo,
        descricao: patch.descricao ?? atividade.descricao,
        responsavel: atividade.responsavel,
        prazo: patch.prazo ?? atividade.prazo,
        vinculo_modulo: atividade.vinculo_modulo,
        responsavel_id: patch.responsavel_id ?? atividade.responsavel_id,
        colaboradores: patch.colaboradores ?? atividade.colaboradores,
        prioridade: patch.prioridade ?? atividade.prioridade,
        descricao_detalhada: patch.descricao_detalhada ?? atividade.descricao_detalhada,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etapas"] });
      qc.invalidateQueries({ queryKey: ["minhas-demandas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atribuir = useMutation({
    mutationFn: async (v: {
      responsavelId: string | null;
      colaboradores?: string[];
      prioridade?: Prioridade;
      prazo?: string | null;
    }) => {
      if (!atividade) return;
      await atribuirFn({ data: { atividadeId: atividade.id, ...v } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etapas"] });
      qc.invalidateQueries({ queryKey: ["minhas-demandas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: async (status: Atividade["status"]) => {
      if (!atividade) return;
      await atualizarKanban(atividade.id, { status }, currentUserId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etapas"] });
      qc.invalidateQueries({ queryKey: ["minhas-demandas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const comentar = useMutation({
    mutationFn: async () => {
      if (!atividade || !currentUserId) throw new Error("Não autenticado");
      await adicionarComentario(atividade.id, currentUserId, novoComentario);
    },
    onSuccess: () => {
      setNovoComentario("");
      qc.invalidateQueries({ queryKey: ["atividade-comentarios", atividade?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!atividade) return null;
  const atrasada = isAtrasadaAtiv(atividade);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={cn("text-[10px]", corDoGrupo(atividade.grupo))}>
              {atividade.grupo}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]", PRIORIDADE_COR[atividade.prioridade])}>
              {PRIORIDADE_LABEL[atividade.prioridade]}
            </Badge>
            {atrasada && <Badge variant="destructive" className="text-[10px]">Atrasada</Badge>}
          </div>
          <SheetTitle className="text-left leading-tight">{atividade.titulo}</SheetTitle>
          {atividade.descricao && (
            <SheetDescription className="text-left">{atividade.descricao}</SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={atividade.status}
                onValueChange={(v) => podeInteragir && mudarStatus.mutate(v as Atividade["status"])}
                disabled={!podeInteragir}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="bloqueada">Bloqueada</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Prioridade</Label>
              <Select
                value={atividade.prioridade}
                onValueChange={(v) => canEdit && atribuir.mutate({
                  responsavelId: atividade.responsavel_id,
                  prioridade: v as Prioridade,
                })}
                disabled={!canEdit}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Prazo</Label>
              <Input
                type="date"
                value={atividade.prazo ?? ""}
                disabled={!canEdit}
                onChange={(e) => atribuir.mutate({
                  responsavelId: atividade.responsavel_id,
                  prazo: e.target.value || null,
                })}
              />
              <span className="text-[11px] text-muted-foreground">
                {formatarPrazoCard(atividade.prazo)}
              </span>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Responsável</Label>
              <Select
                value={atividade.responsavel_id ?? "__none__"}
                onValueChange={(v) => canEdit && atribuir.mutate({
                  responsavelId: v === "__none__" ? null : v,
                })}
                disabled={!canEdit}
              >
                <SelectTrigger><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não atribuído</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">Colaboradores</Label>
            <div className="flex flex-wrap gap-1">
              {atividade.colaboradores.length === 0 && (
                <span className="text-xs text-muted-foreground">Nenhum</span>
              )}
              {atividade.colaboradores.map((cid) => {
                const u = userById.get(cid);
                return (
                  <Badge key={cid} variant="secondary" className="gap-1">
                    {u?.nome ?? cid.slice(0, 6)}
                    {canEdit && (
                      <button
                        onClick={() => atribuir.mutate({
                          responsavelId: atividade.responsavel_id,
                          colaboradores: atividade.colaboradores.filter((x) => x !== cid),
                        })}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        aria-label="Remover"
                      >×</button>
                    )}
                  </Badge>
                );
              })}
            </div>
            {canEdit && (
              <Select
                value=""
                onValueChange={(v) => {
                  if (!v || atividade.colaboradores.includes(v) || v === atividade.responsavel_id) return;
                  atribuir.mutate({
                    responsavelId: atividade.responsavel_id,
                    colaboradores: [...atividade.colaboradores, v],
                  });
                }}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="Adicionar colaborador…" /></SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => u.id !== atividade.responsavel_id && !atividade.colaboradores.includes(u.id))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">Descrição detalhada</Label>
            <Textarea
              rows={4}
              defaultValue={atividade.descricao_detalhada ?? ""}
              disabled={!canEdit}
              onBlur={(e) => {
                if (!canEdit) return;
                const v = e.target.value;
                if (v === (atividade.descricao_detalhada ?? "")) return;
                salvarBase.mutate({ id: atividade.id, descricao_detalhada: v });
              }}
              placeholder="Contexto, checklist, links…"
            />
          </div>

          {link && (
            <Link
              to={link.to}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> {link.label}
            </Link>
          )}

          <div>
            <Button
              variant={guiaAberto ? "secondary" : "outline"}
              size="sm"
              onClick={() => setGuiaAberto((v) => !v)}
              className="gap-1"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {guiaAberto ? "Fechar guia" : "Modo guiado (IA)"}
            </Button>
          </div>
          {guiaAberto && (
            <GuiaPanel atividadeId={atividade.id} guiaCache={atividade.guia_ia} />
          )}

          <Separator />

          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="h-4 w-4" /> Comentários ({comentarios.length})
            </div>
            <ul className="space-y-2">
              {comentarios.map((c) => {
                const autor = userById.get(c.user_id);
                return (
                  <li key={c.id} className="flex gap-2 rounded-md border p-2">
                    <Avatar className="h-7 w-7 text-[10px]">
                      <AvatarFallback>{iniciais(autor?.nome ?? "?")}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{autor?.nome ?? "Usuário"}</span>
                        <span>{new Date(c.criado_em).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{c.texto}</p>
                    </div>
                  </li>
                );
              })}
              {comentarios.length === 0 && (
                <li className="text-xs text-muted-foreground">Nenhum comentário ainda.</li>
              )}
            </ul>
            {podeInteragir && currentUserId && (
              <div className="flex gap-2">
                <Textarea
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                  placeholder="Escrever comentário…"
                  rows={2}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  disabled={!novoComentario.trim() || comentar.isPending}
                  onClick={() => comentar.mutate()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}