import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { avaCoursesOptions, avaCourseStatsOptions } from "@/lib/ava-queries";

export const Route = createFileRoute("/_authenticated/mte/ava")({
  component: AvaDashboard,
});

function AvaDashboard() {
  const coursesQ = useQuery(avaCoursesOptions());
  const courses = coursesQ.data?.rows ?? [];
  const [courseId, setCourseId] = useState<number | null>(null);
  const idAtivo = courseId ?? courses[0]?.moodle_id ?? null;
  const statsQ = useQuery(avaCourseStatsOptions(idAtivo));
  const cursoAtivo = courses.find((c) => c.moodle_id === idAtivo) ?? null;
  const totalAt = statsQ.data?.atividades ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        helpId="importacao.moodle"
        title="Dashboard AVA (Moodle)"
        description="Cruzamento entre alunos do AVA, beneficiárias e turmas."
      />

      <div className="flex items-end gap-3">
        <div className="min-w-[320px]">
          <Label className="text-xs text-muted-foreground">Curso AVA</Label>
          <Select
            value={idAtivo ? String(idAtivo) : undefined}
            onValueChange={(v) => setCourseId(Number(v))}
            disabled={coursesQ.isLoading || courses.length === 0}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um curso" /></SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.moodle_id} value={String(c.moodle_id)}>
                  {c.shortname ?? c.fullname ?? `#${c.moodle_id}`}
                  {c.turma_id ? " · vinculado" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {cursoAtivo ? (
          <div className="flex gap-2 text-xs">
            <Badge variant="secondary">
              <GraduationCap className="mr-1 h-3 w-3" />
              {statsQ.data?.alunos.length ?? 0} alunos
            </Badge>
            <Badge variant="outline">{totalAt} atividades</Badge>
            {cursoAtivo.turma_id ? (
              <Badge className="bg-emerald-100 text-emerald-800">Vinculado à turma MTE</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800">Sem turma MTE</Badge>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Beneficiária MTE</TableHead>
              <TableHead className="text-center">Atividades concluídas</TableHead>
              <TableHead className="text-right">Nota final</TableHead>
              <TableHead>Último acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statsQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell>
                </TableRow>
              ))
            ) : (statsQ.data?.alunos ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  {idAtivo ? "Nenhum aluno neste curso." : "Selecione um curso para visualizar."}
                </TableCell>
              </TableRow>
            ) : (
              statsQ.data!.alunos.map((a) => (
                <TableRow key={a.moodle_id}>
                  <TableCell className="font-medium">
                    {[a.firstname, a.lastname].filter(Boolean).join(" ") || a.username || `#${a.moodle_id}`}
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell className="text-xs">{a.cpf ?? "—"}</TableCell>
                  <TableCell>
                    {a.beneficiaria_id ? (
                      <Badge className="bg-emerald-100 text-emerald-800">Vinculada</Badge>
                    ) : (
                      <Badge variant="outline">Sem vínculo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {a.concluidas}
                    {totalAt > 0 ? ` / ${totalAt} (${Math.round((a.concluidas / totalAt) * 100)}%)` : ""}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {a.nota_final != null ? a.nota_final.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.lastaccess ? new Date(a.lastaccess).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}