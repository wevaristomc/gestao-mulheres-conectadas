import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileScan,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Upload,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { InscricaoDigitalFields } from "@/components/inscricoes/inscricao-digital-fields";
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
import { formatCpf } from "@/lib/cpf";
import { abrirFichaInscricaoParaImpressao } from "@/lib/ficha-inscricao-print";
import type {
  DadosInscricaoDigital,
  InscricaoDigitalRow,
  StatusInscricaoDigital,
} from "@/lib/inscricao-digital";
import {
  aprovarInscricao,
  importarFichaComOcr,
  listarArquivosDriveParaInscricao,
  listarInscricoesDigitais,
  listarTurmasInscricaoPublica,
  rejeitarInscricao,
  salvarRevisaoInscricao,
} from "@/lib/inscricoes-digitais.functions";

export const Route = createFileRoute("/_authenticated/administrativo/inscricoes")({
  component: InscricoesDigitaisTab,
});

const PAPEIS_ESCRITA = ["coordenador_geral", "coordenador_pedagogico", "administrativo"] as const;
const STATUS_LABEL: Record<StatusInscricaoDigital, string> = {
  pendente: "Pendente",
  em_revisao: "Em revisão",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  duplicada: "Duplicada",
};

function badgeStatus(status: StatusInscricaoDigital) {
  const variants: Record<StatusInscricaoDigital, string> = {
    pendente: "border-amber-300 bg-amber-50 text-amber-800",
    em_revisao: "border-blue-300 bg-blue-50 text-blue-800",
    aprovada: "border-emerald-300 bg-emerald-50 text-emerald-800",
    rejeitada: "border-red-300 bg-red-50 text-red-800",
    duplicada: "border-orange-300 bg-orange-50 text-orange-800",
  };
  return (
    <Badge variant="outline" className={variants[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function turmaNome(turma: {
  nome?: string | null;
  nome_curso?: string | null;
  codigo_turma?: string | null;
}) {
  return turma.nome || turma.nome_curso || turma.codigo_turma || "Turma sem nome";
}

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function InscricoesDigitaisTab() {
  const { projetoId } = useActiveContext();
  const { hasAnyRole } = useHasRole();
  const podeEditar = hasAnyRole([...PAPEIS_ESCRITA]);
  const queryClient = useQueryClient();
  const queryKey = ["administrativo", "inscricoes-digitais", projetoId];
  const inscricoesQ = useQuery({
    queryKey,
    enabled: !!projetoId,
    queryFn: () => listarInscricoesDigitais({ data: { projetoId: projetoId! } }),
  });
  const turmasQ = useQuery({
    queryKey: ["inscricao-publica", "turmas"],
    queryFn: () => listarTurmasInscricaoPublica(),
  });
  const turmas = (turmasQ.data ?? []).filter((turma) => turma.projetoId === projetoId);
  const rows = useMemo(() => inscricoesQ.data ?? [], [inscricoesQ.data]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [origem, setOrigem] = useState("todas");
  const [revisao, setRevisao] = useState<InscricaoDigitalRow | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<DadosInscricaoDigital | null>(null);
  const [turmaEdicao, setTurmaEdicao] = useState<string | null>(null);
  const [rejeicaoAberta, setRejeicaoAberta] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [importarAberto, setImportarAberto] = useState(false);

  useEffect(() => {
    if (!revisao) return;
    setDadosEdicao({ ...revisao.dados });
    setTurmaEdicao(revisao.turmaId);
  }, [revisao]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      if (status !== "todos" && row.status !== status) return false;
      if (origem !== "todas" && row.origem !== origem) return false;
      if (
        termo &&
        !`${row.dados.nome} ${row.dados.cpf} ${row.turmaNome}`
          .toLocaleLowerCase("pt-BR")
          .includes(termo)
      )
        return false;
      return true;
    });
  }, [busca, origem, rows, status]);

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const salvar = useMutation({
    mutationFn: async () => {
      if (!projetoId || !revisao || !dadosEdicao) throw new Error("Inscrição não selecionada.");
      return salvarRevisaoInscricao({
        data: {
          id: revisao.id,
          projetoId,
          turmaId: turmaEdicao,
          dados: dadosEdicao as Record<string, unknown>,
        },
      });
    },
    onSuccess: () => {
      toast.success("Revisão salva.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const aprovar = useMutation({
    mutationFn: async () => {
      if (!projetoId || !revisao || !dadosEdicao) throw new Error("Inscrição não selecionada.");
      await salvarRevisaoInscricao({
        data: {
          id: revisao.id,
          projetoId,
          turmaId: turmaEdicao,
          dados: dadosEdicao as Record<string, unknown>,
        },
      });
      return aprovarInscricao({ data: { id: revisao.id, projetoId } });
    },
    onSuccess: (resultado) => {
      if (resultado.duplicada)
        toast.warning(
          `CPF já cadastrado para ${resultado.nome ?? "outra cursista"}. A inscrição foi marcada como duplicada.`,
        );
      else toast.success("Inscrição aprovada; cursista e matrícula criadas.");
      setRevisao(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const rejeitar = useMutation({
    mutationFn: async () => {
      if (!projetoId || !revisao) throw new Error("Inscrição não selecionada.");
      return rejeitarInscricao({ data: { id: revisao.id, projetoId, motivo: motivoRejeicao } });
    },
    onSuccess: () => {
      toast.success("Inscrição rejeitada.");
      setRejeicaoAberta(false);
      setRevisao(null);
      setMotivoRejeicao("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const imprimir = (row: InscricaoDigitalRow, dados: DadosInscricaoDigital = row.dados) =>
    abrirFichaInscricaoParaImpressao({
      protocolo: row.id,
      turmaNome:
        turmas.find((turma) => turma.id === (row.id === revisao?.id ? turmaEdicao : row.turmaId))
          ?.nome ?? row.turmaNome,
      dados,
    });

  if (!projetoId)
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Selecione um projeto ativo.
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ResumoCard
          titulo="Pendentes"
          valor={rows.filter((r) => r.status === "pendente").length}
          icon={Clock3}
        />
        <ResumoCard
          titulo="Em revisão"
          valor={rows.filter((r) => r.status === "em_revisao").length}
          icon={Eye}
        />
        <ResumoCard
          titulo="Aprovadas"
          valor={rows.filter((r) => r.status === "aprovada").length}
          icon={CheckCircle2}
        />
        <ResumoCard
          titulo="Possíveis duplicadas"
          valor={rows.filter((r) => r.duplicidade.encontrada && r.status !== "aprovada").length}
          icon={AlertTriangle}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Fila de inscrições</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Formulários digitais e fichas extraídas por OCR na mesma revisão.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inscricoesQ.refetch()}
              disabled={inscricoesQ.isFetching}
            >
              <RefreshCw
                className={`mr-2 size-4 ${inscricoesQ.isFetching ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
            {podeEditar ? (
              <Button size="sm" onClick={() => setImportarAberto(true)}>
                <FileScan className="mr-2 size-4" />
                Importar fichas escaneadas
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, CPF ou turma"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as origens</SelectItem>
                <SelectItem value="formulario">Formulário</SelectItem>
                <SelectItem value="ocr">OCR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {inscricoesQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cursista</TableHead>
                    <TableHead>Turma</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>OCR</TableHead>
                    <TableHead>Recebida em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.length ? (
                    filtradas.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">
                            {row.dados.nome || "Nome não identificado"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatCpf(row.dados.cpf) || "CPF não identificado"}
                          </div>
                          {row.duplicidade.encontrada && row.status !== "aprovada" ? (
                            <Badge
                              variant="outline"
                              className="mt-1 border-orange-300 text-orange-700"
                            >
                              CPF já cadastrado
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.turmaNome}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {row.origem === "ocr" ? "OCR" : "Formulário"}
                          </Badge>
                        </TableCell>
                        <TableCell>{badgeStatus(row.status)}</TableCell>
                        <TableCell>
                          {row.confiancaOcr == null
                            ? "—"
                            : `${Math.round(row.confiancaOcr * 100)}%`}
                        </TableCell>
                        <TableCell>{new Date(row.criadoEm).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Revisar"
                              onClick={() => setRevisao(row)}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Imprimir ficha"
                              onClick={() => imprimir(row)}
                            >
                              <Printer className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        Nenhuma inscrição encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {inscricoesQ.isError ? (
            <p className="text-sm text-destructive">{(inscricoesQ.error as Error).message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={!!revisao} onOpenChange={(open) => !open && setRevisao(null)}>
        <DialogContent className="h-[94vh] max-w-[96vw] overflow-hidden p-0 xl:max-w-7xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Revisar inscrição</DialogTitle>
            <DialogDescription>
              Confira a ficha e corrija os campos antes de aprovar.
            </DialogDescription>
          </DialogHeader>
          {revisao && dadosEdicao ? (
            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-2">
              <div className="min-h-[320px] border-b bg-muted/30 p-4 lg:border-b-0 lg:border-r">
                {revisao.arquivoUrl ? (
                  <iframe
                    title="Ficha escaneada"
                    src={revisao.arquivoUrl}
                    className="h-full min-h-[70vh] w-full rounded-md border bg-white"
                  />
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-md border border-dashed text-center text-muted-foreground">
                    <FileText className="mb-3 size-10" />
                    <p>Inscrição recebida pelo formulário digital.</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => imprimir(revisao, dadosEdicao)}
                    >
                      <Printer className="mr-2 size-4" />
                      Visualizar ficha preenchida
                    </Button>
                  </div>
                )}
              </div>
              <ScrollArea className="h-[calc(94vh-150px)]">
                <div className="space-y-5 p-6">
                  {revisao.duplicidade.encontrada ? (
                    <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
                      <strong>Possível duplicidade:</strong> este CPF já pertence a{" "}
                      {revisao.duplicidade.nome ?? "uma cursista cadastrada"}. A aprovação marcará
                      esta inscrição como duplicada.
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label>Turma</Label>
                    <Select
                      value={turmaEdicao ?? "sem-turma"}
                      onValueChange={(v) => setTurmaEdicao(v === "sem-turma" ? null : v)}
                      disabled={!podeEditar}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem-turma">Selecionar turma</SelectItem>
                        {turmas.map((turma) => (
                          <SelectItem key={turma.id} value={turma.id}>
                            {turma.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <InscricaoDigitalFields
                    value={dadosEdicao}
                    onChange={setDadosEdicao}
                    mostrarConfianca={revisao.origem === "ocr"}
                    disabled={!podeEditar || revisao.status === "aprovada"}
                  />
                </div>
              </ScrollArea>
            </div>
          ) : null}
          <DialogFooter className="border-t px-6 py-3 sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => revisao && dadosEdicao && imprimir(revisao, dadosEdicao)}
              >
                <Printer className="mr-2 size-4" />
                Imprimir
              </Button>
              {podeEditar && revisao && !["aprovada", "rejeitada"].includes(revisao.status) ? (
                <Button variant="destructive" onClick={() => setRejeicaoAberta(true)}>
                  <UserX className="mr-2 size-4" />
                  Rejeitar
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRevisao(null)}>
                Fechar
              </Button>
              {podeEditar && revisao && !["aprovada", "rejeitada"].includes(revisao.status) ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => salvar.mutate()}
                    disabled={salvar.isPending}
                  >
                    {salvar.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Salvar revisão
                  </Button>
                  <Button onClick={() => aprovar.mutate()} disabled={aprovar.isPending}>
                    {aprovar.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <UserCheck className="mr-2 size-4" />
                    )}
                    Aprovar
                  </Button>
                </>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejeicaoAberta} onOpenChange={setRejeicaoAberta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar inscrição</DialogTitle>
            <DialogDescription>
              Registre o motivo para manter o histórico da revisão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejeicaoAberta(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejeitar.mutate()}
              disabled={rejeitar.isPending || motivoRejeicao.trim().length < 3}
            >
              {rejeitar.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {podeEditar ? (
        <ImportarFichasDialog
          open={importarAberto}
          onOpenChange={setImportarAberto}
          projetoId={projetoId}
          turmas={turmas}
          onImported={refresh}
        />
      ) : null}
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
  icon: typeof Clock3;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{valor}</div>
      </CardContent>
    </Card>
  );
}

function ImportarFichasDialog({
  open,
  onOpenChange,
  projetoId,
  turmas,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  turmas: Array<{ id: string; nome: string }>;
  onImported: () => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [driveSelecionados, setDriveSelecionados] = useState<Set<string>>(new Set());
  const [turmaId, setTurmaId] = useState<string | null>(null);
  const driveQ = useQuery({
    queryKey: ["administrativo", "inscricoes", "drive", projetoId],
    enabled: open,
    queryFn: () => listarArquivosDriveParaInscricao({ data: { projetoId } }),
  });
  const importar = useMutation({
    mutationFn: async () => {
      let sucesso = 0;
      const erros: string[] = [];
      for (const file of arquivos) {
        try {
          if (file.size > 20 * 1024 * 1024)
            throw new Error(`${file.name}: arquivo acima de 20 MB.`);
          const base64 = await arquivoParaBase64(file);
          await importarFichaComOcr({
            data: {
              projetoId,
              turmaId,
              arquivo: { nome: file.name, mime: file.type || "application/pdf", base64 },
            },
          });
          sucesso += 1;
        } catch (error) {
          erros.push(error instanceof Error ? error.message : String(error));
        }
      }
      for (const driveArquivoId of driveSelecionados) {
        try {
          await importarFichaComOcr({ data: { projetoId, turmaId, driveArquivoId } });
          sucesso += 1;
        } catch (error) {
          erros.push(error instanceof Error ? error.message : String(error));
        }
      }
      return { sucesso, erros };
    },
    onSuccess: ({ sucesso, erros }) => {
      if (sucesso) toast.success(`${sucesso} ficha(s) enviada(s) ao OCR.`);
      if (erros.length) toast.error(`${erros.length} arquivo(s) falharam: ${erros[0]}`);
      if (sucesso) {
        onImported();
        onOpenChange(false);
        setArquivos([]);
        setDriveSelecionados(new Set());
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const total = arquivos.length + driveSelecionados.size;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar fichas escaneadas</DialogTitle>
          <DialogDescription>
            Selecione PDFs ou fotos. Fotos JPG/PNG são arquivadas automaticamente como PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Turma (opcional)</Label>
            <Select
              value={turmaId ?? "sem-turma"}
              onValueChange={(v) => setTurmaId(v === "sem-turma" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem-turma">Definir durante a revisão</SelectItem>
                {turmas.map((turma) => (
                  <SelectItem key={turma.id} value={turma.id}>
                    {turma.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center gap-2 font-medium">
              <Upload className="size-4" />
              Upload direto
            </div>
            <Input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              multiple
              onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
            />
            <p className="text-xs text-muted-foreground">
              {arquivos.length
                ? `${arquivos.length} arquivo(s) selecionado(s)`
                : "PDF, PNG ou JPG; até 20 MB por arquivo."}
            </p>
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center gap-2 font-medium">
              <FileScan className="size-4" />
              Arquivos sincronizados do Drive
            </div>
            {driveQ.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <ScrollArea className="h-52 rounded border">
                <div className="divide-y">
                  {(driveQ.data ?? []).map((arquivo) => (
                    <label
                      key={arquivo.id}
                      className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={driveSelecionados.has(arquivo.id)}
                        onCheckedChange={(checked) =>
                          setDriveSelecionados((atual) => {
                            const proximo = new Set(atual);
                            if (checked) proximo.add(arquivo.id);
                            else proximo.delete(arquivo.id);
                            return proximo;
                          })
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{arquivo.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {arquivo.pasta_caminho || "Drive"} · {arquivo.tipo.toUpperCase()}
                        </span>
                      </span>
                    </label>
                  ))}
                  {!driveQ.data?.length ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      Nenhum PDF ou imagem sincronizado.
                    </p>
                  ) : null}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => importar.mutate()} disabled={!total || importar.isPending}>
            {importar.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileScan className="mr-2 size-4" />
            )}
            Processar {total || ""} ficha(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
