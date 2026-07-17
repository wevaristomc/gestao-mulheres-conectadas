import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Filter,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useActiveContext, useHasRole } from "@/hooks/use-active-context";
import {
  qualificacaoCertificadoOptions,
  qualificarMatriculas,
  removerQualificacao,
  type MatriculaQualificacao,
  type OrigemQualificacao,
} from "@/lib/qualificacao-certificado-queries";

export const Route = createFileRoute("/_authenticated/administrativo/qualificacao")({
  component: QualificacaoCertificadoTab,
});

type StatusFiltro = "todos" | "pendente" | "qualificada" | "emitido";
const PAPEIS_COM_ESCRITA = [
  "coordenador_geral",
  "coordenador_pedagogico",
  "administrativo",
] as const;
const LINHAS_VAZIAS: MatriculaQualificacao[] = [];

function normalizar(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function frequenciaMinima(value: string): number {
  const numero = Number(value.replace(",", "."));
  return Number.isFinite(numero) ? Math.min(100, Math.max(0, numero)) : 0;
}

function QualificacaoCertificadoTab() {
  const { projetoId, user } = useActiveContext();
  const { hasAnyRole } = useHasRole();
  const podeEditar = hasAnyRole([...PAPEIS_COM_ESCRITA]);
  const queryClient = useQueryClient();
  const qualificacaoQ = useQuery(qualificacaoCertificadoOptions(projetoId));
  const rows = qualificacaoQ.data?.rows ?? LINHAS_VAZIAS;
  const turmas = qualificacaoQ.data?.turmas ?? [];

  const [turmaFiltro, setTurmaFiltro] = useState("todas");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [frequenciaFiltro, setFrequenciaFiltro] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [alvoIndividual, setAlvoIndividual] = useState<MatriculaQualificacao | null>(null);
  const [observacao, setObservacao] = useState("");
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [removerAlvo, setRemoverAlvo] = useState<MatriculaQualificacao | null>(null);
  const [criterioAberto, setCriterioAberto] = useState(false);
  const [turmaCriterio, setTurmaCriterio] = useState("");
  const [frequenciaCriterio, setFrequenciaCriterio] = useState("75");

  const linhasBase = useMemo(() => {
    const termo = normalizar(busca.trim());
    const frequencia = frequenciaMinima(frequenciaFiltro);
    return rows.filter((row) => {
      if (turmaFiltro !== "todas" && row.turmaId !== turmaFiltro) return false;
      if (termo && !normalizar(row.nome).includes(termo)) return false;
      return row.frequenciaPercentual >= frequencia;
    });
  }, [busca, frequenciaFiltro, rows, turmaFiltro]);

  const linhasFiltradas = useMemo(
    () =>
      linhasBase.filter((row) => {
        if (statusFiltro === "pendente") return !row.qualificacao;
        if (statusFiltro === "qualificada") {
          return !!row.qualificacao && !row.qualificacao.certificadoEmitido;
        }
        if (statusFiltro === "emitido") return row.qualificacao?.certificadoEmitido;
        return true;
      }),
    [linhasBase, statusFiltro],
  );

  const pendentes = linhasBase.filter((row) => !row.qualificacao).length;
  const qualificadas = linhasBase.filter(
    (row) => row.qualificacao && !row.qualificacao.certificadoEmitido,
  ).length;
  const emitidos = linhasBase.filter((row) => row.qualificacao?.certificadoEmitido).length;
  const selecionaveis = linhasFiltradas.filter((row) => !row.qualificacao);
  const selecionadasVisiveis = selecionaveis.filter((row) => selecionadas.has(row.matriculaId));

  const previewCriterio = useMemo(() => {
    const frequencia = frequenciaMinima(frequenciaCriterio);
    return rows.filter(
      (row) =>
        row.turmaId === turmaCriterio &&
        !row.qualificacao &&
        row.frequenciaPercentual >= frequencia,
    );
  }, [frequenciaCriterio, rows, turmaCriterio]);

  const qualificarMut = useMutation({
    mutationFn: async (input: {
      matriculaIds: string[];
      origem: OrigemQualificacao;
      observacao?: string | null;
    }) => {
      if (!podeEditar || !user?.id) throw new Error("Sem permissão para esta ação.");
      const inseridas = await qualificarMatriculas({ ...input, usuarioId: user.id });
      return { inseridas, total: input.matriculaIds.length };
    },
    onSuccess: ({ inseridas, total }) => {
      if (inseridas === 0) toast.info("As matrículas selecionadas já estavam qualificadas.");
      else if (inseridas < total) {
        toast.success(
          `${inseridas} matrícula(s) qualificada(s). As já qualificadas foram ignoradas.`,
        );
      } else {
        toast.success(
          inseridas === 1
            ? "Cursista qualificada para emissão de certificado."
            : `${inseridas} cursistas qualificadas para emissão de certificado.`,
        );
      }
      setSelecionadas(new Set());
      setAlvoIndividual(null);
      setObservacao("");
      setConfirmarLote(false);
      setCriterioAberto(false);
      queryClient.invalidateQueries({ queryKey: ["administrativo", "qualificacao-certificado"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removerMut = useMutation({
    mutationFn: async () => {
      if (!podeEditar || !removerAlvo?.qualificacao) {
        throw new Error("Sem permissão para esta ação.");
      }
      if (removerAlvo.qualificacao.certificadoEmitido) {
        throw new Error("Não é possível remover uma qualificação com certificado emitido.");
      }
      await removerQualificacao({ qualificacaoId: removerAlvo.qualificacao.id });
    },
    onSuccess: () => {
      toast.success("Qualificação removida.");
      setRemoverAlvo(null);
      queryClient.invalidateQueries({ queryKey: ["administrativo", "qualificacao-certificado"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function alternarSelecao(matriculaId: string, marcada: boolean) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      if (marcada) proxima.add(matriculaId);
      else proxima.delete(matriculaId);
      return proxima;
    });
  }

  function alternarTodas(marcada: boolean) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      for (const row of selecionaveis) {
        if (marcada) proxima.add(row.matriculaId);
        else proxima.delete(row.matriculaId);
      }
      return proxima;
    });
  }

  function abrirCriterio() {
    setTurmaCriterio(turmaFiltro !== "todas" ? turmaFiltro : (turmas[0]?.id ?? ""));
    setFrequenciaCriterio("75");
    setCriterioAberto(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Qualificação para Certificado</h2>
          <p className="text-xs text-muted-foreground">
            Autorize individualmente ou em lote quem poderá participar da emissão.
          </p>
        </div>
        {podeEditar ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={abrirCriterio}
              disabled={!turmas.length || qualificacaoQ.isLoading}
            >
              <Filter className="mr-1.5 h-4 w-4" /> Qualificar por critério
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmarLote(true)}
              disabled={selecionadas.size === 0}
            >
              <UsersRound className="mr-1.5 h-4 w-4" />
              Qualificar selecionadas ({selecionadas.size})
            </Button>
          </div>
        ) : (
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Somente leitura
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ResumoCard titulo="Qualificadas" valor={qualificadas} icon={Award} />
        <ResumoCard titulo="Pendentes" valor={pendentes} icon={UsersRound} />
        <ResumoCard titulo="Certificados emitidos" valor={emitidos} icon={CheckCircle2} />
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <div>
            <Label className="text-xs">Turma</Label>
            <Select value={turmaFiltro} onValueChange={setTurmaFiltro}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as turmas</SelectItem>
                {turmas.map((turma) => (
                  <SelectItem key={turma.id} value={turma.id}>
                    {turma.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status da qualificação</Label>
            <Select
              value={statusFiltro}
              onValueChange={(value) => setStatusFiltro(value as StatusFiltro)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Não qualificada</SelectItem>
                <SelectItem value="qualificada">Qualificada</SelectItem>
                <SelectItem value="emitido">Certificado emitido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="busca-cursista" className="text-xs">
              Buscar por nome
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="busca-cursista"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Nome da cursista"
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="frequencia-minima" className="text-xs">
              Frequência mínima (%)
            </Label>
            <Input
              id="frequencia-minima"
              type="number"
              min="0"
              max="100"
              step="1"
              value={frequenciaFiltro}
              onChange={(event) => setFrequenciaFiltro(event.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {qualificacaoQ.isError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Não foi possível carregar as matrículas</div>
            <div className="text-xs opacity-80">
              {qualificacaoQ.error instanceof Error
                ? qualificacaoQ.error.message
                : "Erro desconhecido."}
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {podeEditar ? (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Selecionar matrículas visíveis"
                      checked={
                        selecionadasVisiveis.length > 0 &&
                        selecionadasVisiveis.length === selecionaveis.length
                          ? true
                          : selecionadasVisiveis.length > 0
                            ? "indeterminate"
                            : false
                      }
                      disabled={selecionaveis.length === 0}
                      onCheckedChange={(checked) => alternarTodas(checked === true)}
                    />
                  </TableHead>
                ) : null}
                <TableHead>Cursista</TableHead>
                <TableHead>Turma</TableHead>
                <TableHead className="w-32 text-right">Frequência</TableHead>
                <TableHead className="w-32">Matrícula</TableHead>
                <TableHead className="w-48">Qualificação</TableHead>
                {podeEditar ? <TableHead className="w-44 text-right">Ações</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {qualificacaoQ.isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={podeEditar ? 7 : 5}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : linhasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={podeEditar ? 7 : 5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma matrícula encontrada com os filtros informados.
                  </TableCell>
                </TableRow>
              ) : (
                linhasFiltradas.map((row) => (
                  <TableRow key={row.matriculaId}>
                    {podeEditar ? (
                      <TableCell>
                        {!row.qualificacao ? (
                          <Checkbox
                            aria-label={`Selecionar ${row.nome}`}
                            checked={selecionadas.has(row.matriculaId)}
                            onCheckedChange={(checked) =>
                              alternarSelecao(row.matriculaId, checked === true)
                            }
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-medium">{row.nome}</TableCell>
                    <TableCell>{row.turmaNome}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">
                        {row.frequenciaPercentual.toLocaleString("pt-BR", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        %
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.aulasLancadas
                          ? `${row.presencas}/${row.aulasLancadas} aulas`
                          : "Sem presença lançada"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <BadgeQualificacao row={row} />
                    </TableCell>
                    {podeEditar ? (
                      <TableCell className="text-right">
                        {!row.qualificacao ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setAlvoIndividual(row);
                              setObservacao("");
                            }}
                          >
                            <Award className="mr-1.5 h-3.5 w-3.5" /> Qualificar
                          </Button>
                        ) : !row.qualificacao.certificadoEmitido ? (
                          <Button size="sm" variant="ghost" onClick={() => setRemoverAlvo(row)}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Emissão concluída</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!alvoIndividual}
        onOpenChange={(open) => !open && !qualificarMut.isPending && setAlvoIndividual(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Qualificar cursista</DialogTitle>
            <DialogDescription>
              Confirme a qualificação de {alvoIndividual?.nome} para emissão de certificado.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="observacao-qualificacao">Observação (opcional)</Label>
            <Textarea
              id="observacao-qualificacao"
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              rows={3}
              className="mt-1"
              placeholder="Registre uma justificativa ou informação complementar."
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAlvoIndividual(null)}
              disabled={qualificarMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={qualificarMut.isPending}
              onClick={() =>
                alvoIndividual &&
                qualificarMut.mutate({
                  matriculaIds: [alvoIndividual.matriculaId],
                  origem: "manual",
                  observacao,
                })
              }
            >
              {qualificarMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Award className="mr-1.5 h-4 w-4" />
              )}
              Confirmar qualificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarLote} onOpenChange={setConfirmarLote}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qualificar selecionadas?</AlertDialogTitle>
            <AlertDialogDescription>
              {selecionadas.size} matrícula(s) serão qualificadas para emissão de certificado.
              Matrículas já qualificadas serão ignoradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={qualificarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={qualificarMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                qualificarMut.mutate({ matriculaIds: [...selecionadas], origem: "lote" });
              }}
            >
              {qualificarMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{" "}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={criterioAberto}
        onOpenChange={(open) => !qualificarMut.isPending && setCriterioAberto(open)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Qualificar por critério</DialogTitle>
            <DialogDescription>
              Escolha a turma e a frequência mínima. Confira a prévia antes de gravar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Turma</Label>
              <Select value={turmaCriterio} onValueChange={setTurmaCriterio}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione uma turma" />
                </SelectTrigger>
                <SelectContent>
                  {turmas.map((turma) => (
                    <SelectItem key={turma.id} value={turma.id}>
                      {turma.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="frequencia-criterio">Frequência mínima (%)</Label>
              <Input
                id="frequencia-criterio"
                type="number"
                min="0"
                max="100"
                step="1"
                value={frequenciaCriterio}
                onChange={(event) => setFrequenciaCriterio(event.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="rounded-md border">
            <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
              Prévia: {previewCriterio.length} cursista(s)
            </div>
            <ScrollArea className="h-64">
              {previewCriterio.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma cursista pendente atende ao critério informado.
                </div>
              ) : (
                <ul className="divide-y">
                  {previewCriterio.map((row) => (
                    <li
                      key={row.matriculaId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{row.nome}</span>
                      <span className="text-muted-foreground">
                        {row.frequenciaPercentual.toLocaleString("pt-BR", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        %
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCriterioAberto(false)}
              disabled={qualificarMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={!previewCriterio.length || qualificarMut.isPending}
              onClick={() =>
                qualificarMut.mutate({
                  matriculaIds: previewCriterio.map((row) => row.matriculaId),
                  origem: "criterio",
                })
              }
            >
              {qualificarMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Filter className="mr-1.5 h-4 w-4" />
              )}{" "}
              Confirmar qualificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!removerAlvo}
        onOpenChange={(open) => !open && !removerMut.isPending && setRemoverAlvo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover qualificação?</AlertDialogTitle>
            <AlertDialogDescription>
              {removerAlvo?.nome} deixará de participar do fluxo de emissão. Esta ação só é
              permitida enquanto o certificado ainda não tiver sido emitido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removerMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removerMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                removerMut.mutate();
              }}
            >
              {removerMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}{" "}
              Remover qualificação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ResumoCard({
  titulo,
  valor,
  icon: Icon,
}: {
  titulo: string;
  valor: number;
  icon: typeof Award;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{valor}</div>
      </CardContent>
    </Card>
  );
}

function BadgeQualificacao({ row }: { row: MatriculaQualificacao }) {
  if (!row.qualificacao) return <Badge variant="outline">Não qualificada</Badge>;
  if (row.qualificacao.certificadoEmitido) {
    return <Badge className="bg-blue-600 text-white hover:bg-blue-600">Certificado emitido</Badge>;
  }
  return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Qualificada</Badge>;
}
