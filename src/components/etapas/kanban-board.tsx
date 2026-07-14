import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Clock, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

import {
  atualizarKanban,
  type Atividade,
  type AtividadeStatus,
} from "@/lib/etapas-queries";
import { listarUsuariosParaDemandas } from "@/lib/demandas.functions";
import {
  KANBAN_COLUNAS,
  PRIORIDADE_COR,
  PRIORIDADE_LABEL,
  corDoGrupo,
  formatarPrazoCard,
  iniciais,
  isAtrasadaAtiv,
  type KanbanColKey,
} from "./demanda-utils";

type UserLite = { id: string; nome: string; email: string; role: string };

export function KanbanBoard({
  atividades,
  onOpenCard,
  currentUserId,
  canEditAll,
  projetoId,
}: {
  atividades: Atividade[];
  onOpenCard: (a: Atividade) => void;
  currentUserId: string | null;
  canEditAll: boolean;
  projetoId: string | null;
}) {
  const qc = useQueryClient();
  const listarUsersFn = useServerFn(listarUsuariosParaDemandas);

  const usersQ = useQuery({
    queryKey: ["demandas-users", projetoId],
    enabled: !!projetoId,
    staleTime: 60_000,
    queryFn: async (): Promise<UserLite[]> => {
      if (!projetoId) return [];
      return listarUsersFn({ data: { projetoId } }) as Promise<UserLite[]>;
    },
  });
  const users = usersQ.data ?? [];
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const [countsByAtiv] = useCommentCounts(atividades.map((a) => a.id));

  const columns = useMemo(() => {
    const map: Record<KanbanColKey, Atividade[]> = {
      pendente: [],
      em_andamento: [],
      bloqueada: [],
      concluida: [],
    };
    for (const a of atividades) {
      map[a.status as KanbanColKey]?.push(a);
    }
    for (const k of Object.keys(map) as KanbanColKey[]) {
      map[k].sort((a, b) => (a.ordem_kanban || 0) - (b.ordem_kanban || 0));
    }
    return map;
  }, [atividades]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const move = useMutation({
    mutationFn: async (v: { id: string; status: AtividadeStatus; ordem: number }) => {
      await atualizarKanban(v.id, { status: v.status, ordem_kanban: v.ordem }, currentUserId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etapas"] });
      qc.invalidateQueries({ queryKey: ["minhas-demandas"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["etapas"] });
    },
  });

  function podeMover(a: Atividade): boolean {
    if (canEditAll) return true;
    if (!currentUserId) return false;
    return a.responsavel_id === currentUserId || a.colaboradores.includes(currentUserId);
  }

  function handleDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const target = KANBAN_COLUNAS.find((c) => c.key === overId);
    if (!target) return;
    const ativ = atividades.find((a) => a.id === activeId);
    if (!ativ || ativ.status === target.key) return;
    if (!podeMover(ativ)) {
      toast.error("Você só pode mover demandas em que é responsável ou colaborador.");
      return;
    }
    const maxOrdem = columns[target.key as KanbanColKey].reduce(
      (m, a) => Math.max(m, a.ordem_kanban || 0),
      0,
    );
    move.mutate({ id: activeId, status: target.key as AtividadeStatus, ordem: maxOrdem + 10 });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {KANBAN_COLUNAS.map((col) => (
          <KanbanColumn
            key={col.key}
            colKey={col.key}
            label={col.label}
            cards={columns[col.key]}
            onOpen={onOpenCard}
            userById={userById}
            countsByAtiv={countsByAtiv}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  colKey,
  label,
  cards,
  onOpen,
  userById,
  countsByAtiv,
}: {
  colKey: KanbanColKey;
  label: string;
  cards: Atividade[];
  onOpen: (a: Atividade) => void;
  userById: Map<string, UserLite>;
  countsByAtiv: Map<string, number>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: colKey });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-muted/30 p-2 transition-colors",
        isOver && "bg-primary/10 border-primary",
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-full bg-background px-2 py-0.5">{cards.length}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[80px]">
        {cards.map((a) => (
          <KanbanCard
            key={a.id}
            atividade={a}
            onOpen={() => onOpen(a)}
            userById={userById}
            comentariosCount={countsByAtiv.get(a.id) ?? 0}
          />
        ))}
        {cards.length === 0 && (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Sem demandas
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  atividade,
  onOpen,
  userById,
  comentariosCount,
}: {
  atividade: Atividade;
  onOpen: () => void;
  userById: Map<string, UserLite>;
  comentariosCount: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: atividade.id,
  });
  const responsavel = atividade.responsavel_id ? userById.get(atividade.responsavel_id) : null;
  const atrasada = isAtrasadaAtiv(atividade);

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.6 : 1 }}
      className={cn(
        "cursor-grab select-none p-2 shadow-sm active:cursor-grabbing",
        atividade.status === "concluida" && "opacity-70",
      )}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Só abre no clique simples, não durante drag
        if (!isDragging) {
          e.stopPropagation();
          onOpen();
        }
      }}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <Badge variant="secondary" className={cn("text-[9px] px-1.5 py-0", corDoGrupo(atividade.grupo))}>
          {atividade.grupo}
        </Badge>
        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", PRIORIDADE_COR[atividade.prioridade])}>
          {PRIORIDADE_LABEL[atividade.prioridade]}
        </Badge>
        {atividade.guia_ia ? (
          <Badge variant="outline" className="gap-0.5 border-primary/40 px-1.5 py-0 text-[9px] text-primary">
            <Sparkles className="h-2.5 w-2.5" /> Guia
          </Badge>
        ) : null}
      </div>
      <p className={cn("line-clamp-2 text-sm font-medium leading-snug", atividade.status === "concluida" && "line-through")}>
        {atividade.titulo}
      </p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1", atrasada && "text-destructive font-medium")}>
          {atrasada ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {formatarPrazoCard(atividade.prazo)}
        </span>
        <div className="flex items-center gap-2">
          {comentariosCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle className="h-3 w-3" /> {comentariosCount}
            </span>
          )}
          {responsavel && (
            <Avatar className="h-5 w-5 text-[8px]">
              <AvatarFallback>{iniciais(responsavel.nome)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </Card>
  );
}

function useCommentCounts(ids: string[]): [Map<string, number>] {
  const key = ids.slice().sort().join(",");
  const q = useQuery({
    queryKey: ["atividade-comentarios-count", key],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase.from("atividade_comentarios" as any) as any)
        .select("atividade_id")
        .in("atividade_id", ids);
      const map = new Map<string, number>();
      for (const r of (data ?? []) as { atividade_id: string }[]) {
        map.set(r.atividade_id, (map.get(r.atividade_id) ?? 0) + 1);
      }
      return map;
    },
  });
  return [q.data ?? new Map()];
}