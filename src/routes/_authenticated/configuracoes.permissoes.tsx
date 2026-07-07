import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useActiveContext } from "@/hooks/use-active-context";
import { listarPermissoesMatriz, atualizarPermissao } from "@/lib/rbac.functions";

export const Route = createFileRoute("/_authenticated/configuracoes/permissoes")({
  component: PermissoesPage,
});

type Row = {
  role: string;
  modulo: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
};

const ROLES_V2: Array<{ v: string; label: string }> = [
  { v: "admin", label: "Admin" },
  { v: "coordenador", label: "Coordenador" },
  { v: "instrutor", label: "Instrutor" },
  { v: "financeiro", label: "Financeiro" },
  { v: "parceiro_mte", label: "Parceiro MTE" },
  { v: "captacao", label: "Captação" },
];

const ACOES: Array<{ k: "pode_ver" | "pode_criar" | "pode_editar" | "pode_excluir"; label: string }> = [
  { k: "pode_ver", label: "Ver" },
  { k: "pode_criar", label: "Criar" },
  { k: "pode_editar", label: "Editar" },
  { k: "pode_excluir", label: "Excluir" },
];

function PermissoesPage() {
  const { projetoId, role } = useActiveContext();
  const qc = useQueryClient();
  const listarFn = useServerFn(listarPermissoesMatriz);
  const atualizarFn = useServerFn(atualizarPermissao);

  const isCoord = role === "coordenador_geral";

  const q = useQuery({
    queryKey: ["permissoes_matriz"],
    queryFn: () => listarFn() as Promise<Row[]>,
  });

  const mut = useMutation({
    mutationFn: (payload: Row) =>
      atualizarFn({ data: { projetoId: projetoId!, ...payload } as any }),
    onSuccess: () => { toast.success("Permissão atualizada."); qc.invalidateQueries({ queryKey: ["permissoes_matriz"] }); qc.invalidateQueries({ queryKey: ["permissoes_papel"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const modulos = useMemo(() => {
    const set = new Set<string>();
    (q.data ?? []).forEach((r) => set.add(r.modulo));
    return Array.from(set).sort();
  }, [q.data]);

  const byKey = useMemo(() => {
    const m = new Map<string, Row>();
    (q.data ?? []).forEach((r) => m.set(`${r.role}::${r.modulo}`, r));
    return m;
  }, [q.data]);

  if (!isCoord) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          Apenas Coordenação Geral pode editar a matriz de permissões.
        </CardContent>
      </Card>
    );
  }

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando matriz…
        </CardContent>
      </Card>
    );
  }

  if (q.error) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" /> {(q.error as Error).message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Matriz papel × módulo. Alterações são aplicadas imediatamente e afetam todos os usuários do papel.
        </p>
        <Badge variant="outline" className="text-[10px]">Fase 6 · RBAC</Badge>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Módulo</TableHead>
                  {ROLES_V2.map((r) => (
                    <TableHead key={r.v} className="text-center">
                      <div className="font-semibold">{r.label}</div>
                      <div className="mt-1 flex justify-center gap-1 text-[9px] text-muted-foreground">
                        {ACOES.map((a) => (<span key={a.k} className="w-6">{a.label[0]}</span>))}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {modulos.map((modulo) => (
                  <TableRow key={modulo}>
                    <TableCell className="font-mono text-xs">{modulo}</TableCell>
                    {ROLES_V2.map((r) => {
                      const row = byKey.get(`${r.v}::${modulo}`);
                      if (!row) return <TableCell key={r.v} className="text-center text-[10px] text-muted-foreground">—</TableCell>;
                      return (
                        <TableCell key={r.v}>
                          <div className="flex justify-center gap-1">
                            {ACOES.map((a) => (
                              <Checkbox
                                key={a.k}
                                checked={row[a.k]}
                                disabled={mut.isPending}
                                onCheckedChange={(v) =>
                                  mut.mutate({ ...row, [a.k]: v === true })
                                }
                                aria-label={`${r.label}/${modulo}/${a.label}`}
                              />
                            ))}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">V/C/E/X = Ver, Criar, Editar, eXcluir.</p>
    </div>
  );
}