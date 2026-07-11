import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BeneficiariaFormDialog } from "@/components/mte/beneficiaria-form-dialog";
import { BeneficiariasCsvImport } from "@/components/mte/beneficiarias-csv-import";
import { useHasRole } from "@/hooks/use-active-context";
import { formatCpf, formatPhone } from "@/lib/cpf";
import {
  beneficiariasListOptions, deleteBeneficiaria, type Beneficiaria,
} from "@/lib/mte-queries";

export const Route = createFileRoute("/_authenticated/mte/beneficiarias")({
  component: BeneficiariasIndex,
});

function BeneficiariasIndex() {
  const qc = useQueryClient();
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "administrativo"]);
  const [busca, setBusca] = useState("");
  const q = useQuery(beneficiariasListOptions(busca));
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editing, setEditing] = useState<Beneficiaria | null>(null);
  const [deleting, setDeleting] = useState<Beneficiaria | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteBeneficiaria(id),
    onSuccess: () => {
      toast.success("Beneficiária excluída");
      qc.invalidateQueries({ queryKey: ["mte", "beneficiarias"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  return (
    <div>
      <PageHeader
        helpId="beneficiaria.cpf"
        title="Beneficiárias"
        description="Cadastro de mulheres atendidas pelo projeto (Termo de Fomento MTE)."
        actions={
          canWrite ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
                <Upload className="mr-1 h-4 w-4" /> Importar CSV
              </Button>
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> Nova beneficiária
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-3 relative w-full max-w-sm">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CPF…"
          className="pl-7"
        />
      </div>

      <div className="rounded-md border">
        {/* Mobile cards */}
        <ul className="divide-y md:hidden">
          {q.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="p-3"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-56" /></li>
            ))
          ) : rows.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">Nenhuma beneficiária encontrada.</li>
          ) : rows.map((b) => (
            <li key={b.id} className="flex min-w-0 items-start justify-between gap-2 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="break-words text-sm font-semibold">{b.nome}</div>
                <div className="text-xs text-muted-foreground">CPF: {formatCpf(b.cpf)}</div>
                <div className="text-xs text-muted-foreground">
                  {(b.municipio ?? "—")}{b.telefone ? ` • ${formatPhone(b.telefone)}` : ""}
                </div>
                <div className="flex flex-wrap gap-1">
                  {b.pcd ? <Badge variant="secondary" className="text-[10px]">PcD</Badge> : null}
                  {b.beneficiaria_programa_social ? <Badge variant="secondary" className="text-[10px]">Prog. social</Badge> : null}
                  {b.raca ? <Badge variant="outline" className="text-[10px]">{b.raca}</Badge> : null}
                </div>
              </div>
              {canWrite ? (
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => { setEditing(b); setDialogOpen(true); }} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => setDeleting(b)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-40">CPF</TableHead>
              <TableHead>Município</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma beneficiária encontrada.
                </TableCell>
              </TableRow>
            ) : rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.nome}</TableCell>
                <TableCell className="text-sm">{formatCpf(b.cpf)}</TableCell>
                <TableCell>{b.municipio ?? "—"}</TableCell>
                <TableCell className="text-sm">{b.telefone ? formatPhone(b.telefone) : "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {b.pcd ? <Badge variant="secondary">PcD</Badge> : null}
                    {b.beneficiaria_programa_social ? <Badge variant="secondary">Prog. social</Badge> : null}
                    {b.raca ? <Badge variant="outline" className="text-[10px]">{b.raca}</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {canWrite ? (
                    <div className="inline-flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(b); setDialogOpen(true); }} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(b)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      <BeneficiariaFormDialog open={dialogOpen} onOpenChange={setDialogOpen} beneficiaria={editing} />
      <BeneficiariasCsvImport open={csvOpen} onOpenChange={setCsvOpen} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir beneficiária?</AlertDialogTitle>
            <AlertDialogDescription>
              Se houver matrículas vinculadas, a exclusão pode falhar. Considere marcar como evadida/desistente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deleting) del.mutate(deleting.id); }}
              disabled={del.isPending}
            >
              {del.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}