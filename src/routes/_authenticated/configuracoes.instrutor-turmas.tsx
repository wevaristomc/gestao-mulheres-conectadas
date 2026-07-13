import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertCircle, ShieldAlert, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useActiveContext } from "@/hooks/use-active-context";
import { listarUsuariosProjeto } from "@/lib/users.functions";
import {
  listarInstrutorTurmas, listarTurmasDoProjeto,
  vincularInstrutorTurma, desvincularInstrutorTurma,
} from "@/lib/rbac.functions";

export const Route = createFileRoute("/_authenticated/configuracoes/instrutor-turmas")({
  component: InstrutorTurmasPage,
});

type Usuario = { id: string; email: string; nome: string | null; role: string; ativo: boolean };
type Turma = { id: string; nome: string | null; codigo: string | null };
type Vinculo = { id: string; user_id: string; turma_id: string; projeto_id: string };

function formatTurmaLabel(t: Turma) {
  if (t.nome && t.nome.trim()) {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="truncate">{t.nome}</span>
        {t.codigo ? (
          <span className="text-xs text-muted-foreground">· {t.codigo}</span>
        ) : null}
      </span>
    );
  }
  if (t.codigo) return <span>{t.codigo}</span>;
  return <span className="text-muted-foreground">{t.id.slice(0, 8)}</span>;
}

function InstrutorTurmasPage() {
  const { projetoId, role } = useActiveContext();
  const qc = useQueryClient();
  const listarUsers = useServerFn(listarUsuariosProjeto);
  const listarTurmas = useServerFn(listarTurmasDoProjeto);
  const listarVinc = useServerFn(listarInstrutorTurmas);
  const vincularFn = useServerFn(vincularInstrutorTurma);
  const desvincFn = useServerFn(desvincularInstrutorTurma);

  const isCoord = role === "coordenador_geral";

  const [userSel, setUserSel] = useState<string>("");
  const [turmaSel, setTurmaSel] = useState<string>("");

  const usersQ = useQuery({
    queryKey: ["usuarios", projetoId],
    queryFn: () => listarUsers({ data: { projetoId: projetoId! } }) as Promise<Usuario[]>,
    enabled: !!projetoId && isCoord,
  });
  const turmasQ = useQuery({
    queryKey: ["turmas-projeto", projetoId],
    queryFn: () => listarTurmas({ data: { projetoId: projetoId! } }) as Promise<Turma[]>,
    enabled: !!projetoId && isCoord,
  });
  const vincQ = useQuery({
    queryKey: ["instrutor-turmas", projetoId],
    queryFn: () => listarVinc({ data: { projetoId: projetoId! } }) as Promise<Vinculo[]>,
    enabled: !!projetoId && isCoord,
  });

  const instrutores = useMemo(
    () => (usersQ.data ?? []).filter((u) => ["professor", "auxiliar_pedagogico"].includes(u.role)),
    [usersQ.data],
  );

  const turmasById = useMemo(() => {
    const m = new Map<string, Turma>();
    (turmasQ.data ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [turmasQ.data]);

  const usersById = useMemo(() => {
    const m = new Map<string, Usuario>();
    (usersQ.data ?? []).forEach((u) => m.set(u.id, u));
    return m;
  }, [usersQ.data]);

  const invalidateVinc = () => qc.invalidateQueries({ queryKey: ["instrutor-turmas", projetoId] });

  const vincular = useMutation({
    mutationFn: () =>
      vincularFn({ data: { projetoId: projetoId!, userId: userSel, turmaId: turmaSel } }),
    onSuccess: () => { toast.success("Vínculo criado."); invalidateVinc(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const desvincular = useMutation({
    mutationFn: (v: Vinculo) =>
      desvincFn({ data: { projetoId: projetoId!, userId: v.user_id, turmaId: v.turma_id } }),
    onSuccess: () => { toast.success("Vínculo removido."); invalidateVinc(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isCoord) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          Apenas Coordenação Geral pode gerenciar vínculos instrutor ↔ turma.
        </CardContent>
      </Card>
    );
  }
  if (!projetoId) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Selecione um projeto ativo.</CardContent></Card>;
  }

  const anyLoading = usersQ.isLoading || turmasQ.isLoading || vincQ.isLoading;
  const anyError = usersQ.error || turmasQ.error || vincQ.error;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Vincule instrutores (papel <code>professor</code> ou <code>auxiliar_pedagogico</code>) às turmas que eles conduzem.
        Isso permite que lancem aulas e presenças apenas das suas turmas.
      </p>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="text-xs text-muted-foreground">Instrutor</label>
            <Select value={userSel} onValueChange={setUserSel}>
              <SelectTrigger><SelectValue placeholder="Selecionar instrutor…" /></SelectTrigger>
              <SelectContent>
                {instrutores.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum instrutor com papel pedagógico.</div>
                ) : instrutores.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome ?? u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Turma</label>
            <Select value={turmaSel} onValueChange={setTurmaSel}>
              <SelectTrigger><SelectValue placeholder="Selecionar turma…" /></SelectTrigger>
              <SelectContent>
                {(turmasQ.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {formatTurmaLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => vincular.mutate()}
              disabled={!userSel || !turmaSel || vincular.isPending}
            >
              {vincular.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
              Vincular
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {anyLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : anyError ? (
            <div className="flex items-start gap-2 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" /> {(anyError as Error).message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instrutor</TableHead>
                  <TableHead>Turma</TableHead>
                  <TableHead className="w-1 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(vincQ.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum vínculo cadastrado ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  (vincQ.data ?? []).map((v) => {
                    const u = usersById.get(v.user_id);
                    const t = turmasById.get(v.turma_id);
                    return (
                      <TableRow key={v.id}>
                        <TableCell>{u?.nome ?? u?.email ?? v.user_id.slice(0, 8)}</TableCell>
                        <TableCell>{t ? formatTurmaLabel(t) : v.turma_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => desvincular.mutate(v)}
                            disabled={desvincular.isPending}
                            title="Remover vínculo"
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}