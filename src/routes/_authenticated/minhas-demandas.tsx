import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useActiveContext } from "@/hooks/use-active-context";
import { minhasDemandasOptions, type Atividade } from "@/lib/etapas-queries";
import { parseISODateLocal } from "@/lib/date-utils";
import { KanbanBoard } from "@/components/etapas/kanban-board";
import { AtividadeSheet } from "@/components/etapas/atividade-sheet";
import {
  PRIORIDADE_COR,
  PRIORIDADE_LABEL,
  corDoGrupo,
  formatarPrazoCard,
  isAtrasadaAtiv,
} from "@/components/etapas/demanda-utils";

export const Route = createFileRoute("/_authenticated/minhas-demandas")({
  head: () => ({ meta: [{ title: "Minhas Demandas · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("minhas-demandas"),
  component: MinhasDemandasPage,
});

type Bucket = "atrasadas" | "hoje" | "semana" | "depois" | "concluidas";

function classificar(a: Atividade): Bucket {
  if (a.status === "concluida") return "concluidas";
  if (isAtrasadaAtiv(a)) return "atrasadas";
  if (!a.prazo) return "depois";
  const p = parseISODateLocal(a.prazo);
  if (!p) return "depois";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diffDias = Math.round((p.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias <= 0) return "hoje";
  if (diffDias <= 7) return "semana";
  return "depois";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  atrasadas: "Atrasadas",
  hoje: "Hoje",
  semana: "Esta semana",
  depois: "Depois",
  concluidas: "Concluídas",
};

function MinhasDemandasPage() {
  const { user, projetoId } = useActiveContext();
  const q = useQuery(minhasDemandasOptions(user?.id ?? null, projetoId));
  const rows = q.data?.rows ?? [];
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Atividade | null>(null);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (a) => a.titulo.toLowerCase().includes(t) || a.grupo.toLowerCase().includes(t),
    );
  }, [rows, busca]);

  const buckets = useMemo(() => {
    const g: Record<Bucket, Atividade[]> = {
      atrasadas: [], hoje: [], semana: [], depois: [], concluidas: [],
    };
    for (const a of filtradas) g[classificar(a)].push(a);
    return g;
  }, [filtradas]);

  const abertas = rows.filter((a) => a.status !== "concluida").length;
  const atrasadas = rows.filter((a) => isAtrasadaAtiv(a)).length;

  return (
    <div>
      <PageHeader
        title="Minhas Demandas"
        description={`${abertas} abertas · ${atrasadas} atrasadas`}
      />
      <div className="mb-4">
        <Input
          placeholder="Buscar por título ou grupo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="mt-4 space-y-4">
          {q.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
          {!q.isLoading && rows.length === 0 && (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              Nada por aqui — nenhuma demanda atribuída a você ainda.
            </CardContent></Card>
          )}
          {(["atrasadas", "hoje", "semana", "depois", "concluidas"] as Bucket[]).map((b) => {
            const lista = buckets[b];
            if (lista.length === 0) return null;
            return (
              <Card key={b}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {BUCKET_LABEL[b]}
                    <Badge variant={b === "atrasadas" ? "destructive" : "secondary"}>
                      {lista.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {lista.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center gap-2 py-2 cursor-pointer hover:bg-muted/40 rounded px-2"
                        onClick={() => setSel(a)}
                      >
                        <Badge variant="secondary" className={cn("text-[10px]", corDoGrupo(a.grupo))}>
                          {a.grupo}
                        </Badge>
                        <span className={cn("flex-1 min-w-0 truncate text-sm", a.status === "concluida" && "line-through text-muted-foreground")}>
                          {a.titulo}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px]", PRIORIDADE_COR[a.prioridade])}>
                          {PRIORIDADE_LABEL[a.prioridade]}
                        </Badge>
                        <span className={cn(
                          "text-xs text-muted-foreground",
                          isAtrasadaAtiv(a) && "text-destructive font-medium",
                        )}>
                          {formatarPrazoCard(a.prazo)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        <TabsContent value="kanban" className="mt-4">
          <KanbanBoard
            atividades={filtradas}
            onOpenCard={setSel}
            currentUserId={user?.id ?? null}
            canEditAll={false}
            projetoId={projetoId}
          />
        </TabsContent>
      </Tabs>

      <AtividadeSheet
        atividade={sel}
        open={!!sel}
        onOpenChange={(v) => !v && setSel(null)}
        canEdit={false}
        currentUserId={user?.id ?? null}
        projetoId={projetoId}
      />
    </div>
  );
}