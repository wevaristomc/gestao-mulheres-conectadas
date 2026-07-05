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
  );
}