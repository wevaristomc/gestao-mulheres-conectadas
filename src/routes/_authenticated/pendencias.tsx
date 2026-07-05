import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
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

function PendenciasPage() {
  const [status, setStatus] = useState<string>("aberta");
  const [busca, setBusca] = useState("");
  const query = useQuery(pendenciasListOptions(status));
  const rows = (query.data?.rows ?? []) as PendenciaRow[];
  const erro = query.data?.error ?? (query.isError ? String(query.error) : null);

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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
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
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por texto, status ou ID"
            className="pl-8"
          />
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Status</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-48">Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  </TableRow>
                ))
              ) : rowsFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma pendência para o filtro atual.
                  </TableCell>
                </TableRow>
              ) : (
                rowsFiltradas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)} className="capitalize">
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xl truncate" title={payloadResumo(r.payload)}>
                      {payloadResumo(r.payload)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtData(r.criado_em)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}