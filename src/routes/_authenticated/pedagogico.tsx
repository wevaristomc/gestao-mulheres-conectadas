import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/pedagogico")({
  head: () => ({ meta: [{ title: "Pedagógico · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("pedagogico"),
  component: () => <Outlet />,
});
  const { projetoId, projetoNome } = useActiveContext();
  const q = useQuery(turmasListOptions(projetoId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  return (
    <div>
      <PageHeader
        title="Pedagógico"
        description={
          projetoNome
            ? `Turmas do projeto · ${projetoNome}`
            : "Selecione um projeto para visualizar as turmas."
        }
      />

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Sem acesso ou tabela indisponível</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Turma</TableHead>
                <TableHead className="w-32">Turno</TableHead>
                <TableHead className="w-40">Início</TableHead>
                <TableHead className="w-40">Fim</TableHead>
                <TableHead className="w-24 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma turma cadastrada neste projeto.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r: Row) => {
                  const nome = pickFirst(r, ["nome", "titulo", "descricao"]) ?? r.id;
                  const turno = pickFirst(r, ["turno", "periodo"]);
                  const inicio = pickFirst(r, ["data_inicio", "inicio", "data_de_inicio"]);
                  const fim = pickFirst(r, ["data_fim", "fim", "data_de_fim"]);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/pedagogico/turmas/$id"
                          params={{ id: r.id }}
                          className="hover:underline"
                        >
                          {nome}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{turno ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatarData(inicio)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatarData(fim)}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          to="/pedagogico/turmas/$id"
                          params={{ id: r.id }}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Abrir <ChevronRight className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}