import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, Landmark } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cursistasByTurmaOptions, pickFirst, type Row } from "@/lib/pedagogico-queries";
import { BankFieldsInlineDialog, type BankInlineTarget } from "@/components/mte/bank-fields-inline-dialog";
import { useHasRole } from "@/hooks/use-active-context";
import { formatCpf } from "@/lib/cpf";
import { downloadCSV, toCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/pedagogico/turmas/$id/cursistas")({
  component: CursistasTab,
});

function CursistasTab() {
  const { id: turmaId } = Route.useParams();
  const q = useQuery(cursistasByTurmaOptions(turmaId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "administrativo"]);
  const [bankTarget, setBankTarget] = useState<BankInlineTarget | null>(null);

  type Extraido = {
    id: string;
    matriculaId: string;
    nome: string;
    cpf: string;
    email: string;
    status: string;
    banco: string | null;
    agencia: string | null;
    conta: string | null;
    beneficiariaId: string | null;
  };

  const extrair = (m: Row): Extraido => {
    const cursista = (m.cursistas as Row | null | undefined) ?? null;
    const beneficiaria = (m.beneficiarias as Row | null | undefined) ?? null;
    const nome =
      (pickFirst(beneficiaria, ["nome", "nome_completo"]) as string | null) ??
      (pickFirst(cursista, ["nome", "nome_completo"]) as string | null) ??
      (pickFirst(m, ["nome"]) as string | null) ??
      (m.cursista_id as string | null) ??
      m.id;
    const cpf =
      (pickFirst(beneficiaria, ["cpf"]) as string | null) ??
      (pickFirst(cursista, ["cpf"]) as string | null) ??
      "";
    const email =
      (pickFirst(beneficiaria, ["email"]) as string | null) ??
      (pickFirst(cursista, ["email"]) as string | null) ??
      (pickFirst(m, ["email"]) as string | null) ??
      "—";
    const status = (pickFirst(m, ["status", "situacao"]) as string | null) ?? "ativa";
    return {
      id: m.id,
      matriculaId: m.id,
      nome: String(nome ?? ""),
      cpf: String(cpf ?? ""),
      email: String(email ?? "—"),
      status: String(status),
      banco: (pickFirst(beneficiaria, ["banco"]) as string | null) ?? null,
      agencia: (pickFirst(beneficiaria, ["agencia"]) as string | null) ?? null,
      conta: (pickFirst(beneficiaria, ["conta"]) as string | null) ?? null,
      beneficiariaId: (beneficiaria?.id as string | undefined) ?? (m.beneficiaria_id as string | undefined) ?? null,
    };
  };

  const linhas = rows.map(extrair);

  const abrirBanco = (e: Extraido) => {
    if (!e.cpf) return;
    if (e.beneficiariaId) {
      setBankTarget({
        kind: "beneficiaria",
        beneficiariaId: e.beneficiariaId,
        nome: e.nome,
        cpf: e.cpf,
        banco: e.banco,
        agencia: e.agencia,
        conta: e.conta,
      });
    } else {
      setBankTarget({
        kind: "matricula",
        matriculaId: e.matriculaId,
        nome: e.nome,
        cpf: e.cpf,
        banco: e.banco,
        agencia: e.agencia,
        conta: e.conta,
      });
    }
  };

  const exportarContas = () => {
    const cols = ["nome", "cpf", "banco", "agencia", "conta", "status"];
    const data = linhas.map((l) => ({
      nome: l.nome,
      cpf: l.cpf ? formatCpf(l.cpf) : "",
      banco: l.banco ?? "",
      agencia: l.agencia ?? "",
      conta: l.conta ?? "",
      status: l.status,
    }));
    downloadCSV(`contas-turma-${turmaId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(data, cols));
  };

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
    <>
    <div className="mb-3 flex items-center justify-end">
      <Button size="sm" variant="outline" onClick={exportarContas} disabled={linhas.length === 0}>
        <Download className="mr-1 h-4 w-4" /> Exportar contas (CSV)
      </Button>
    </div>
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
        ) : linhas.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma cursista matriculada nesta turma.
          </li>
        ) : (
          linhas.map((l) => (
            <li key={l.id} className="flex min-w-0 items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate text-sm font-semibold">{l.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{l.email}</div>
                <div className="text-xs">
                  {l.banco || l.agencia || l.conta ? (
                    <span className="text-muted-foreground">
                      {l.banco ?? "—"} • Ag. {l.agencia ?? "—"} • Conta {l.conta ?? "—"}
                    </span>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">sem conta bancária</Badge>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canWrite && l.cpf ? (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => abrirBanco(l)} title="Dados bancários">
                    <Landmark className="h-4 w-4" />
                  </Button>
                ) : null}
                <Badge variant="secondary" className="shrink-0 capitalize">{l.status}</Badge>
              </div>
            </li>
          ))
        )}
      </ul>
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cursista</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Dados bancários</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-20 text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8" /></TableCell>
              </TableRow>
            ))
          ) : linhas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                Nenhuma cursista matriculada nesta turma.
              </TableCell>
            </TableRow>
          ) : (
            linhas.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-muted-foreground">{l.email}</TableCell>
                <TableCell className="text-sm">
                  {l.banco || l.agencia || l.conta ? (
                    <span className="text-muted-foreground">
                      {l.banco ?? "—"} • Ag. {l.agencia ?? "—"} • Conta {l.conta ?? "—"}
                    </span>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">sem conta</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">{l.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && l.cpf ? (
                    <Button size="icon" variant="ghost" onClick={() => abrirBanco(l)} title="Dados bancários">
                      <Landmark className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
    </div>
    <BankFieldsInlineDialog
      open={!!bankTarget}
      onOpenChange={(o) => !o && setBankTarget(null)}
      target={bankTarget}
      invalidateKeys={[["pedagogico", "cursistas", turmaId], ["mte", "beneficiarias"]]}
    />
    </>
  );
}