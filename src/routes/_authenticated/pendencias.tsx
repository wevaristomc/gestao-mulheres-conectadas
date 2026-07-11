import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pendenciasListOptions, type PendenciaRow } from "@/lib/dashboard-queries";
import {
  carregarPendenciasOficio49148,
  PENDENCIAS_OFICIO_49148,
  type ResumoSeedOficio,
} from "@/lib/oficio-49148.functions";

export const Route = createFileRoute("/_authenticated/pendencias")({
  head: () => ({ meta: [{ title: "Pendências · Painel Mulheres Conectadas" }] }),
  component: PendenciasPage,
});

const STATUS_OPCOES: Array<{ value: string; label: string }> = [
  { value: "todas", label: "Todos os status" },
  { value: "aberta", label: "Abertas" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "resolvida", label: "Resolvidas" },
];

function statusVariant(status: string): "destructive" | "default" | "secondary" {
  if (status === "aberta") return "destructive";
  if (status === "em_andamento") return "default";
  return "secondary";
}

function payloadResumo(payload: PendenciaRow["payload"]): string {
  if (!payload || typeof payload !== "object") return "—";
  const p = payload as Record<string, unknown>;
  const cand = ["titulo", "mensagem", "descricao", "tipo", "assunto", "resumo"];
  for (const k of cand) {
    const v = p[k];
    if (typeof v === "string" && v.trim().length) return v;
  }
  try {
    const s = JSON.stringify(payload);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  } catch {
    return "—";
  }
}

function prioridadeVariant(p: string | undefined): "destructive" | "default" | "secondary" {
  if (p === "CRITICA") return "destructive";
  if (p === "ALTA") return "default";
  return "secondary";
}

function fmtDataCurta(iso: string | undefined | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(iso + "T00:00:00"));
  } catch {
    return iso;
  }
}

function PendenciasPage() {
  const [status, setStatus] = useState<string>("aberta");
  const [busca, setBusca] = useState("");
  const query = useQuery(pendenciasListOptions(status));
  const rows = (query.data?.rows ?? []) as PendenciaRow[];
  const erro = query.data?.error ?? (query.isError ? String(query.error) : null);
  const qc = useQueryClient();
  const carregar = useServerFn(carregarPendenciasOficio49148);
  const seedMut = useMutation({
    mutationFn: async () => (await carregar()) as ResumoSeedOficio,
    onSuccess: (r) => {
      toast.success(
        `Ofício 49148/2026 · ${r.criadas} nova(s), ${r.existentes} já cadastrada(s)`,
      );
      qc.invalidateQueries({ queryKey: ["pendencias"] });
      qc.invalidateQueries({ queryKey: ["kpi", "pendencias-abertas"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao carregar pendências"),
  });

  const rowsFiltradas = useMemo(() => {
    if (!busca.trim()) return rows;
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      const resumo = payloadResumo(r.payload).toLowerCase();
      return resumo.includes(q) || r.status.toLowerCase().includes(q) || r.id.includes(q);
    });
  }, [rows, busca]);

  const fmtData = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div>
      <PageHeader
        title="Pendências"
        description="Itens sinalizados pelo sistema aguardando ação da equipe."
      />

      <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex flex-wrap items-start gap-3 sm:items-center">
        <FileText className="mt-0.5 h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <div className="font-medium">Ofício SEI nº 49148/2026 (doc. 9151564)</div>
          <div className="break-words text-xs text-muted-foreground">
            Processo 19968.200342/2025-94 · {PENDENCIAS_OFICIO_49148.length} pendências
            (idempotente — não duplica por título).
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => seedMut.mutate()}
          disabled={seedMut.isPending}
          className="w-full sm:w-auto"
        >
          {seedMut.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-1 h-4 w-4" />
          )}
          Carregar pendências do Ofício 49148/2026
        </Button>
      </div>
      {seedMut.data ? (
        <div className="mb-4 rounded-md border bg-background p-3 text-xs">
          Ofício 49148/2026 · <strong>{seedMut.data.criadas}</strong> criada(s), <strong>{seedMut.data.existentes}</strong> já existia(m) de <strong>{seedMut.data.total}</strong> itens.
          {seedMut.data.inconsistencias.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-amber-800">
              {seedMut.data.inconsistencias.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPCOES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full flex-1 sm:min-w-64">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por texto, status ou ID"
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground sm:ml-auto">
          {query.isLoading ? "Carregando…" : `${rowsFiltradas.length} registro(s)`}
        </div>
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Falha ao ler pendências</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          {/* Mobile cards */}
          <ul className="divide-y md:hidden">
            {query.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="p-3"><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-3 w-full" /></li>
              ))
            ) : rowsFiltradas.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted-foreground">Nenhuma pendência para o filtro atual.</li>
            ) : rowsFiltradas.map((r) => {
              const p = (r.payload ?? {}) as Record<string, unknown>;
              const prioridade = typeof p.prioridade === "string" ? p.prioridade : undefined;
              const responsavel = typeof p.responsavel === "string" ? p.responsavel : "—";
              const prazo = typeof p.prazo === "string" ? p.prazo : null;
              return (
                <li key={r.id} className="p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(r.status)} className="capitalize">{r.status.replace("_", " ")}</Badge>
                    {prioridade ? <Badge variant={prioridadeVariant(prioridade)} className="text-[10px]">{prioridade}</Badge> : null}
                  </div>
                  <div className="break-words text-sm">{payloadResumo(r.payload)}</div>
                  <div className="text-xs text-muted-foreground">
                    Responsável: {responsavel} • Prazo: {fmtDataCurta(prazo)} • {fmtData(r.criado_em)}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-24">Prioridade</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-40">Responsável</TableHead>
                <TableHead className="w-24">Prazo</TableHead>
                <TableHead className="w-48">Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  </TableRow>
                ))
              ) : rowsFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma pendência para o filtro atual.
                  </TableCell>
                </TableRow>
              ) : (
                rowsFiltradas.map((r) => {
                  const p = (r.payload ?? {}) as Record<string, unknown>;
                  const prioridade = typeof p.prioridade === "string" ? p.prioridade : undefined;
                  const responsavel = typeof p.responsavel === "string" ? p.responsavel : "—";
                  const prazo = typeof p.prazo === "string" ? p.prazo : null;
                  return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)} className="capitalize">
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {prioridade ? (
                        <Badge variant={prioridadeVariant(prioridade)} className="text-[10px]">
                          {prioridade}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="max-w-xl truncate" title={payloadResumo(r.payload)}>
                      {payloadResumo(r.payload)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{responsavel}</TableCell>
                    <TableCell className="text-xs">{fmtDataCurta(prazo)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtData(r.criado_em)}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      )}
    </div>
  );
}