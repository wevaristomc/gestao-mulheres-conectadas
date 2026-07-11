import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cursistasByTurmaOptions, pickFirst, type Row } from "@/lib/pedagogico-queries";

export const Route = createFileRoute("/_authenticated/pedagogico/turmas/$id/cursistas")({
  component: CursistasTab,
});

function CursistasTab() {
  const { id: turmaId } = Route.useParams();
  const q = useQuery(cursistasByTurmaOptions(turmaId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  if (erro) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">Sem acesso ou tabela indisponível</div>
          <div className="text-xs opacity-80">{erro}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      {/* Mobile: card list — desktop: table */}
      <ul className="divide-y md:hidden">
        {q.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-56" />
            </li>
          ))
        ) : rows.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma cursista matriculada nesta turma.
          </li>
        ) : (
          rows.map((m: Row) => {
            const cursista = (m.cursistas as Row | null | undefined) ?? null;
            const nome =
              pickFirst(cursista, ["nome", "nome_completo"]) ??
              pickFirst(m, ["nome"]) ??
              (m.cursista_id as string) ??
              m.id;
            const email = pickFirst(cursista, ["email"]) ?? pickFirst(m, ["email"]) ?? "—";
            const status = pickFirst(m, ["status", "situacao"]) ?? "ativa";
            return (
              <li key={m.id} className="flex min-w-0 items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{nome}</div>
                  <div className="truncate text-xs text-muted-foreground">{email}</div>
                </div>
                <Badge variant="secondary" className="shrink-0 capitalize">{status}</Badge>
              </li>
            );
          })
        )}
      </ul>
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cursista</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead className="w-32">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                Nenhuma cursista matriculada nesta turma.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((m: Row) => {
              const cursista = (m.cursistas as Row | null | undefined) ?? null;
              const nome =
                pickFirst(cursista, ["nome", "nome_completo"]) ??
                pickFirst(m, ["nome"]) ??
                (m.cursista_id as string) ??
                m.id;
              const email = pickFirst(cursista, ["email"]) ?? pickFirst(m, ["email"]) ?? "—";
              const status = pickFirst(m, ["status", "situacao"]) ?? "ativa";
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{nome}</TableCell>
                  <TableCell className="text-muted-foreground">{email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}