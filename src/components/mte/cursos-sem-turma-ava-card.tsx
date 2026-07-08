import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Loader2, Plus, RefreshCw, School } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TurmaFormDialog } from "@/components/mte/turma-form-dialog";
import { listarCursosSemTurma, type CursoSemTurma } from "@/lib/ava-turmas.functions";
import type { TurmaMTE } from "@/lib/mte-queries";

function normalizaCodigo(shortname: string | null): string {
  return (shortname ?? "").trim().replace(/^Turma\s*:?\s*/i, "").trim();
}

export function CursosSemTurmaAvaCard() {
  const listar = useServerFn(listarCursosSemTurma);
  const q = useQuery({
    queryKey: ["ava", "cursos-sem-turma"],
    queryFn: async () => (await listar()) as { cursos: CursoSemTurma[] },
  });
  const cursos = useMemo(() => q.data?.cursos ?? [], [q.data]);

  const [initialValues, setInitialValues] = useState<Partial<TurmaMTE> | null>(null);
  const [open, setOpen] = useState(false);

  function criar(curso: CursoSemTurma) {
    setInitialValues({
      codigo_turma: normalizaCodigo(curso.shortname),
      nome_curso: curso.fullname ?? curso.shortname ?? "",
      data_inicio: curso.startdate ? curso.startdate.slice(0, 10) : "",
      data_fim: curso.enddate ? curso.enddate.slice(0, 10) : "",
    });
    setOpen(true);
  }

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <School className="h-4 w-4" /> Cursos do AVA sem turma correspondente
        </h3>
        <p className="text-xs text-muted-foreground">
          Cursos existentes no Moodle que ainda não têm turma cadastrada no sistema.
          Clique em <em>Criar turma</em> para abrir o cadastro já pré-preenchido com
          código, nome e datas — os demais campos MTE ficam por sua conta.
        </p>
      </div>

      <div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {q.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{(q.error as Error).message}</div>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código sugerido</TableHead>
              <TableHead>Nome do curso</TableHead>
              <TableHead className="w-24">Início</TableHead>
              <TableHead className="w-24">Fim</TableHead>
              <TableHead className="w-16 text-center">Alunos</TableHead>
              <TableHead className="w-32 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : cursos.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                Todos os cursos do AVA já estão cruzados com turmas.
              </TableCell></TableRow>
            ) : (
              cursos.map((c) => (
                <TableRow key={c.moodle_id}>
                  <TableCell className="font-mono text-xs">{normalizaCodigo(c.shortname) || "—"}</TableCell>
                  <TableCell>{c.fullname ?? c.shortname ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.startdate ? c.startdate.slice(0, 10) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.enddate ? c.enddate.slice(0, 10) : "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs">{c.alunos}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => criar(c)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Criar turma
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TurmaFormDialog open={open} onOpenChange={setOpen} initialValues={initialValues} />
    </div>
  );
}