import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  Download,
  Eye,
  ExternalLink,
  FileScan,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
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
import {
  DadosInscricaoDigital,
  InscricaoDigitalRow,
  StatusInscricaoDigital,
  TURNO_PREFERIDO_LABEL,
  type TurmaInscricaoPublica,
  type TurnoPreferido,
} from "@/lib/inscricao-digital";
import {
  anexarDocumentoInscricao,
  aprovarInscricao,
  confirmarImportacaoGoogleForms,
  gerarAnaliseIaRelatorioInscricoes,
  importarFichaComOcr,
  listarArquivosDriveParaInscricao,
  listarInscricoesDigitais,
  listarRelatorioInscricoesPorRegiao,
  listarTurmasInscricaoPublica,
  previewImportacaoGoogleForms,
  rejeitarInscricao,
  salvarRevisaoInscricao,
  type RelatorioInscricoesRegiao,
  type ResultadoPreviewGoogleForms,
} from "@/lib/inscricoes-digitais.functions";
import { gerarPdfRelatorioInscricoesPorRegiao } from "@/lib/relatorio-inscricoes-pdf";
import { criarPastaDriveCursista } from "@/lib/cursistas-drive.functions";

export const Route = createFileRoute("/_authenticated/administrativo/inscricoes")({
  component: InscricoesDigitaisTab,
});

const PAPEIS_ESCRITA = ["coordenador_geral", "coordenador_pedagogico", "administrativo"] as const;
const ORIGEM_LABEL = {
  formulario: "Formulário",
  ocr: "OCR",
  google_forms: "Google Forms",
} as const;

const STATUS_LABEL: Record<StatusInscricaoDigital, string> = {
  pendente: "Pendente",
  em_revisao: "Em revisão",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  duplicada: "Duplicada",
};

function badgeOrigem(origem: string) {
  return (
    <Badge variant={origem === "google_forms" ? "outline" : "secondary"}>
      {ORIGEM_LABEL[origem as keyof typeof ORIGEM_LABEL] ?? origem}
    </Badge>
  );
}

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

function normalizarComparacao(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function turnoLabel(valor: string | null | undefined): string {
  if (!valor) return "Não informado";
  return TURNO_PREFERIDO_LABEL[valor as TurnoPreferido] ?? valor;
}
function calcularIdade(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  const nascimento = new Date(`${dataNascimento}T12:00:00`);
  if (Number.isNaN(nascimento.getTime()) || nascimento > new Date()) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aniversarioPassou =
    hoje.getMonth() > nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
  if (!aniversarioPassou) idade -= 1;
  return idade;
}

function idadeInformadaObservacoes(observacoes: string | null | undefined): number | null {
  const match = (observacoes ?? "").match(/Idade informada:\s*(\d{1,3})/i);
  if (!match) return null;
  const idade = Number(match[1]);
  return Number.isFinite(idade) ? idade : null;
}

function municipioForaDaArea(row: InscricaoDigitalRow, turmas: TurmaInscricaoPublica[]): boolean {
  const municipio = normalizarComparacao(row.dados.municipio);
  if (!municipio) return false;
  const municipiosComTurma = new Set(
    turmas.map((turma) => normalizarComparacao(turma.municipio)).filter(Boolean),
  );
  return municipiosComTurma.size > 0 && !municipiosComTurma.has(municipio);
}

function BadgesPendenciasInscricao({
  row,
  turmas,
}: {
  row: InscricaoDigitalRow;
  turmas: TurmaInscricaoPublica[];
}) {
  const idadeInformada = idadeInformadaObservacoes(row.dados.observacoes);
  const badges = [
    !row.documentoPath
      ? { label: "Documento pendente", className: "border-amber-300 text-amber-800" }
      : null,
    municipioForaDaArea(row, turmas)
      ? { label: "Fora da área de turmas", className: "border-orange-300 text-orange-800" }
      : null,
    idadeInformada != null && idadeInformada < 18
      ? { label: "Menor de 18 (idade informada)", className: "border-purple-300 text-purple-800" }
      : null,
  ].filter(Boolean) as Array<{ label: string; className: string }>;
  if (!badges.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge key={badge.label} variant="outline" className={badge.className}>
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}

function AnexoPreview({
  titulo,
  url,
  ausente,
  onUpload,
  uploading,
  disabled,
}: {
  titulo: string;
  url: string | null;
  ausente: string;
  onUpload?: (file: File) => void;
  uploading?: boolean;
  disabled?: boolean;
}) {
  return (
    <section className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {url ? (
          <Button variant="ghost" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 size-3" /> Abrir
            </a>
          </Button>
        ) : null}
      </div>
      {url ? (
        <iframe
          title={titulo}
          src={url}
          className="h-[42vh] min-h-72 w-full rounded-md border bg-white"
        />
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {ausente}
        </p>
      )}
      {onUpload ? (
        <div className="space-y-1">
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={disabled || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) onUpload(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {uploading
              ? "Enviando..."
              : "PDF, JPG ou PNG até 10 MB. Fotos serão arquivadas em PDF."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function sugerirTurma(
  dados: DadosInscricaoDigital,
  turmas: TurmaInscricaoPublica[],
): TurmaInscricaoPublica | null {
  const municipio = normalizarComparacao(dados.municipio);
  const turno = normalizarComparacao(dados.turno_preferido);
  const polo = normalizarComparacao(dados.polo_preferido);
  if (!municipio || !turno) return null;
  const turnoCompativel = (turma: TurmaInscricaoPublica) =>
    turno === "qualquer" || normalizarComparacao(turma.turno) === turno;
  const municipioCompativel = (turma: TurmaInscricaoPublica) => {
    const municipioTurma = normalizarComparacao(turma.municipio);
    return (
      !!municipioTurma &&
      (municipioTurma === municipio ||
        municipioTurma.includes(municipio) ||
        municipio.includes(municipioTurma))
    );
  };
  const poloCompativel = (turma: TurmaInscricaoPublica) => {
    if (!polo) return false;
    const local = normalizarComparacao(`${turma.nome} ${turma.localAula} ${turma.localEndereco}`);
    const termos = polo
      .replace(/\bbh\b/g, "belo horizonte")
      .split(/\s+-\s+|\s+/)
      .filter((termo) => termo.length > 2 && termo !== "polo");
    return termos.length > 0 && termos.every((termo) => local.includes(termo));
  };

  return (
    turmas.find(
      (turma) => municipioCompativel(turma) && turnoCompativel(turma) && poloCompativel(turma),
    ) ??
    turmas.find((turma) => municipioCompativel(turma) && turnoCompativel(turma)) ??
    null
  );
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
  const turmas = useMemo(
    () => (turmasQ.data ?? []).filter((turma) => turma.projetoId === projetoId),
    [projetoId, turmasQ.data],
  );
  const relatorioKey = ["administrativo", "inscricoes-relatorio-regiao", projetoId];
  const relatorioQ = useQuery({
    queryKey: relatorioKey,
    enabled: !!projetoId && podeEditar,
    queryFn: () => listarRelatorioInscricoesPorRegiao({ data: { projetoId: projetoId! } }),
  });
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
  const [importarFormsAberto, setImportarFormsAberto] = useState(false);
  const [analiseIa, setAnaliseIa] = useState("");

  useEffect(() => {
    if (!revisao) return;
    setDadosEdicao({ ...revisao.dados });
    setTurmaEdicao(revisao.turmaId ?? sugerirTurma(revisao.dados, turmas)?.id ?? null);
  }, [revisao, turmas]);

  const turmaSugerida = useMemo(
    () => (dadosEdicao ? sugerirTurma(dadosEdicao, turmas) : null),
    [dadosEdicao, turmas],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      if (status !== "todos" && row.status !== status) return false;
      if (origem !== "todas" && row.origem !== origem) return false;
      if (
        termo &&
        !`${row.dados.nome} ${row.dados.nome_social} ${row.dados.cpf} ${row.turmaNome} ${row.dados.municipio} ${row.dados.polo_preferido} ${row.dados.bairro_referencia} ${row.dados.turno_preferido}`
          .toLocaleLowerCase("pt-BR")
          .includes(termo)
      )
        return false;
      return true;
    });
  }, [busca, origem, rows, status]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: relatorioKey });
  };
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
  const anexarDocumento = useMutation({
    mutationFn: async ({ tipo, file }: { tipo: "documento" | "comprovante"; file: File }) => {
      if (!projetoId || !revisao) throw new Error("Inscrição não selecionada.");
      if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
      const base64 = await arquivoParaBase64(file);
      return anexarDocumentoInscricao({
        data: {
          id: revisao.id,
          projetoId,
          tipo,
          arquivo: { nome: file.name, mime: file.type || "application/pdf", base64 },
        },
      });
    },
    onSuccess: (resultado, variaveis) => {
      setRevisao((atual) =>
        atual
          ? {
              ...atual,
              documentoPath: resultado.documentoPath,
              documentoUrl: resultado.documentoUrl,
              comprovantePath: resultado.comprovantePath,
              comprovanteUrl: resultado.comprovanteUrl,
            }
          : atual,
      );
      toast.success(variaveis.tipo === "documento" ? "Documento anexado." : "Comprovante anexado.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const criarPastaDrive = useMutation({
    mutationFn: async (cursistaId: string) => criarPastaDriveCursista({ data: { cursistaId } }),
    onSuccess: (resultado) => {
      setRevisao((atual) =>
        atual
          ? {
              ...atual,
              pastaDriveId: resultado.pastaDriveId,
              pastaDriveUrl: resultado.pastaDriveUrl,
              documentosDriveSincronizados: resultado.erros.length === 0,
            }
          : atual,
      );
      toast.success(
        resultado.sincronizados > 0
          ? "Pasta e documentos sincronizados no Drive."
          : "Pasta da cursista pronta no Drive.",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirmarAprovacao = () => {
    if (!revisao) return;
    if (!revisao.documentoPath) {
      const ok = window.confirm(
        "Aprovar sem documento anexado? A pendência será registrada na observação da matrícula para cobrança posterior.",
      );
      if (!ok) return;
    }
    aprovar.mutate();
  };
  const gerarAnalise = useMutation({
    mutationFn: async () => {
      if (!projetoId) throw new Error("Selecione um projeto ativo.");
      return gerarAnaliseIaRelatorioInscricoes({ data: { projetoId } });
    },
    onSuccess: (resultado) => {
      setAnaliseIa(resultado.analise);
      queryClient.setQueryData(relatorioKey, resultado.relatorio);
      toast.success("Análise de IA gerada.");
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
              <>
                <Button variant="outline" size="sm" onClick={() => setImportarFormsAberto(true)}>
                  <FileSpreadsheet className="mr-2 size-4" />
                  Importar do Google Forms
                </Button>
                <Button size="sm" onClick={() => setImportarAberto(true)}>
                  <FileScan className="mr-2 size-4" />
                  Importar fichas escaneadas
                </Button>
              </>
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
                <SelectItem value="google_forms">Google Forms</SelectItem>
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
                    <TableHead>Preferências</TableHead>
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
                            {row.dados.nome_social || row.dados.nome || "Nome não identificado"}
                          </div>
                          {row.dados.nome_social ? (
                            <div className="text-xs text-muted-foreground">
                              Nome completo: {row.dados.nome || "Não identificado"}
                            </div>
                          ) : null}
                          <div className="text-xs text-muted-foreground">
                            {formatCpf(row.dados.cpf) || "CPF não identificado"}
                            {calcularIdade(row.dados.data_nascimento) != null ? (
                              <div className="text-xs text-muted-foreground">
                                {calcularIdade(row.dados.data_nascimento)} anos
                              </div>
                            ) : null}
                          </div>
                          {row.duplicidade.encontrada && row.status !== "aprovada" ? (
                            <Badge
                              variant="outline"
                              className="mt-1 border-orange-300 text-orange-700"
                            >
                              CPF já cadastrado
                            </Badge>
                          ) : null}
                          <BadgesPendenciasInscricao row={row} turmas={turmas} />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{turnoLabel(row.dados.turno_preferido)}</div>
                          <div className="max-w-56 text-xs text-muted-foreground">
                            {row.dados.polo_preferido ||
                              row.dados.municipio ||
                              "Local não informado"}
                            {row.dados.bairro_referencia ? ` · ${row.dados.bairro_referencia}` : ""}
                          </div>
                        </TableCell>
                        <TableCell>{row.turmaNome}</TableCell>
                        <TableCell>{badgeOrigem(row.origem)}</TableCell>
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
                      <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
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

      {podeEditar ? (
        <RelatorioInscricoesCard
          relatorio={relatorioQ.data}
          carregando={relatorioQ.isLoading}
          erro={relatorioQ.error as Error | null}
          analise={analiseIa}
          gerandoAnalise={gerarAnalise.isPending}
          onGerarAnalise={() => gerarAnalise.mutate()}
          onExportar={() =>
            relatorioQ.data &&
            gerarPdfRelatorioInscricoesPorRegiao({ relatorio: relatorioQ.data, analise: analiseIa })
          }
        />
      ) : null}

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
              <ScrollArea className="h-[calc(94vh-150px)] border-b bg-muted/30 lg:border-b-0 lg:border-r">
                <div className="space-y-4 p-4">
                  {revisao.arquivoUrl ? (
                    <AnexoPreview
                      titulo="Ficha escaneada"
                      url={revisao.arquivoUrl}
                      ausente="Ficha escaneada não disponível."
                    />
                  ) : (
                    <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed bg-background text-center text-muted-foreground">
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
                  <AnexoPreview
                    titulo="Documento com foto (RG/CNH)"
                    url={revisao.documentoUrl}
                    ausente="Documento com foto não anexado."
                    onUpload={
                      podeEditar
                        ? (file) => anexarDocumento.mutate({ tipo: "documento", file })
                        : undefined
                    }
                    uploading={anexarDocumento.isPending}
                    disabled={anexarDocumento.isPending}
                  />
                  <AnexoPreview
                    titulo="Comprovante de endereço"
                    url={revisao.comprovanteUrl}
                    ausente="Comprovante pendente; poderá ser cobrado pela coordenação."
                    onUpload={
                      podeEditar
                        ? (file) => anexarDocumento.mutate({ tipo: "comprovante", file })
                        : undefined
                    }
                    uploading={anexarDocumento.isPending}
                    disabled={anexarDocumento.isPending}
                  />
                  {revisao.status === "aprovada" && revisao.cursistaId ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Pasta da cursista no Drive</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-muted-foreground">
                        {revisao.pastaDriveUrl ? (
                          <>
                            <Button asChild variant="outline" className="w-full justify-start">
                              <a href={revisao.pastaDriveUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="mr-2 size-4" />
                                Abrir pasta no Drive
                              </a>
                            </Button>
                            {!revisao.documentosDriveSincronizados && podeEditar ? (
                              <Button
                                variant="secondary"
                                className="w-full justify-start"
                                onClick={() => criarPastaDrive.mutate(revisao.cursistaId!)}
                                disabled={criarPastaDrive.isPending}
                              >
                                {criarPastaDrive.isPending ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                  <FolderPlus className="mr-2 size-4" />
                                )}
                                Sincronizar documentos no Drive
                              </Button>
                            ) : null}
                          </>
                        ) : podeEditar ? (
                          <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => criarPastaDrive.mutate(revisao.cursistaId!)}
                            disabled={criarPastaDrive.isPending}
                          >
                            {criarPastaDrive.isPending ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <FolderPlus className="mr-2 size-4" />
                            )}
                            Criar pasta e sincronizar documentos
                          </Button>
                        ) : (
                          <p>Pasta da cursista ainda não registrada.</p>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </ScrollArea>
              <ScrollArea className="h-[calc(94vh-150px)]">
                <div className="space-y-5 p-6">
                  {revisao.duplicidade.encontrada ? (
                    <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
                      <strong>Possível duplicidade:</strong> este CPF já pertence a{" "}
                      {revisao.duplicidade.nome ?? "uma cursista cadastrada"}. A aprovação marcará
                      esta inscrição como duplicada.
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Preferências para alocação
                      </p>
                      <BadgesPendenciasInscricao row={revisao} turmas={turmas} />
                    </div>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-6">
                      <div>
                        <strong>Nome social:</strong> {dadosEdicao.nome_social || "Não informado"}
                      </div>
                      <div>
                        <strong>Turno:</strong> {turnoLabel(dadosEdicao.turno_preferido)}
                      </div>
                      <div>
                        <strong>Polo:</strong> {dadosEdicao.polo_preferido || "Não informado"}
                      </div>
                      <div>
                        <strong>Município:</strong> {dadosEdicao.municipio || "Não informado"}
                      </div>
                      <div>
                        <strong>Referência:</strong>{" "}
                        {dadosEdicao.bairro_referencia || "Não informada"}
                      </div>
                      <div>
                        <strong>Idade:</strong>{" "}
                        {calcularIdade(dadosEdicao.data_nascimento) ?? "Não calculada"}
                        {calcularIdade(dadosEdicao.data_nascimento) != null ? " anos" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label>Turma para matrícula</Label>
                      {!revisao.turmaId && turmaSugerida?.id === turmaEdicao ? (
                        <Badge variant="secondary">Sugestão automática</Badge>
                      ) : null}
                    </div>
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
                            {turma.localAula ? ` · ${turma.localAula}` : ""}
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
                  <Button onClick={confirmarAprovacao} disabled={aprovar.isPending || !turmaEdicao}>
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
        <ImportarGoogleFormsDialog
          open={importarFormsAberto}
          onOpenChange={setImportarFormsAberto}
          projetoId={projetoId}
          onImported={refresh}
        />
      ) : null}

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

function RelatorioInscricoesCard({
  relatorio,
  carregando,
  erro,
  analise,
  gerandoAnalise,
  onGerarAnalise,
  onExportar,
}: {
  relatorio?: RelatorioInscricoesRegiao;
  carregando: boolean;
  erro: Error | null;
  analise: string;
  gerandoAnalise: boolean;
  onGerarAnalise: () => void;
  onExportar: () => void;
}) {
  const demandaSemOferta = relatorio?.linhas.filter((linha) => linha.demandaSemOferta).length ?? 0;
  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Relatório por região</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Demanda de inscrições por município, bairro, turno e oferta de turmas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/administrativo/inscricoes-dashboard">
              <LayoutDashboard className="mr-2 size-4" />
              Abrir dashboard
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onExportar} disabled={!relatorio}>
            <Download className="mr-2 size-4" />
            Exportar PDF
          </Button>
          <Button size="sm" onClick={onGerarAnalise} disabled={!relatorio || gerandoAnalise}>
            {gerandoAnalise ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            Gerar análise com IA
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando ? (
          <Skeleton className="h-40 w-full" />
        ) : erro ? (
          <p className="text-sm text-destructive">{erro.message}</p>
        ) : relatorio ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-2xl font-semibold">{relatorio.total}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Pendentes</div>
                <div className="text-2xl font-semibold">{relatorio.pendentes}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Turnos</div>
                <div className="text-sm font-medium">
                  {Object.entries(relatorio.porTurno)
                    .map(([turno, total]) => `${turnoLabel(turno)}: ${total}`)
                    .join(" · ") || "—"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Demanda sem oferta</div>
                <div className="text-2xl font-semibold text-orange-700">{demandaSemOferta}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Município</TableHead>
                    <TableHead>Bairro/referência</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Oferta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatorio.linhas.slice(0, 80).map((linha) => (
                    <TableRow
                      key={`${linha.municipio}-${linha.bairroReferencia}-${linha.turnoPreferido}`}
                    >
                      <TableCell className="font-medium">{linha.municipio}</TableCell>
                      <TableCell>{linha.bairroReferencia}</TableCell>
                      <TableCell>{turnoLabel(linha.turnoPreferido)}</TableCell>
                      <TableCell>{linha.total}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        Pend. {linha.pendentes} · Rev. {linha.emRevisao} · Apr. {linha.aprovadas} ·
                        Rej. {linha.rejeitadas} · Dup. {linha.duplicadas}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {linha.turmas} turma(s) · {linha.vagas} vaga(s)
                        </div>
                        {linha.demandaSemOferta ? (
                          <Badge
                            variant="outline"
                            className="mt-1 border-orange-300 text-orange-700"
                          >
                            demanda acima da oferta
                          </Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!relatorio.linhas.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                        Sem inscrições para agregar.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            {analise ? (
              <div className="rounded-lg border bg-muted/30 p-4">
                <h3 className="mb-2 font-semibold">Análise da IA</h3>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{analise}</div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function statusPreviewLabel(status: string): string {
  if (status === "importar") return "A importar";
  if (status === "duplicada") return "Duplicada";
  if (status === "nao_elegivel") return "Não elegível";
  if (status === "sem_autorizacao") return "Sem autorização";
  return "Erro";
}

function ImportarGoogleFormsDialog({
  open,
  onOpenChange,
  projetoId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onImported: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<ResultadoPreviewGoogleForms | null>(null);
  const arquivoPayload = async () => {
    if (!arquivo) throw new Error("Selecione um arquivo CSV ou XLSX.");
    if (arquivo.size > 20 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 20 MB.");
    return { nome: arquivo.name, mime: arquivo.type, base64: await arquivoParaBase64(arquivo) };
  };
  const gerarPreview = useMutation({
    mutationFn: async () =>
      previewImportacaoGoogleForms({ data: { projetoId, arquivo: await arquivoPayload() } }),
    onSuccess: (resultado) => setPreview(resultado),
    onError: (error: Error) => toast.error(error.message),
  });
  const confirmar = useMutation({
    mutationFn: async () =>
      confirmarImportacaoGoogleForms({ data: { projetoId, arquivo: await arquivoPayload() } }),
    onSuccess: (resultado) => {
      setPreview(resultado);
      toast.success(`${resultado.resumo.importar} pré-inscrição(ões) importada(s).`);
      onImported();
      if (resultado.resumo.erro === 0) {
        onOpenChange(false);
        setArquivo(null);
        setPreview(null);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar do Google Forms</DialogTitle>
          <DialogDescription>
            Envie o CSV ou XLSX exportado do Google Sheets. O sistema mostra um preview antes de
            gravar na fila.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border p-4">
            <Label>Arquivo exportado</Label>
            <Input
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => {
                setArquivo(event.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
            <p className="text-xs text-muted-foreground">CSV ou XLSX, até 20 MB.</p>
          </div>
          {preview ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
                <ResumoMini label="A importar" valor={preview.resumo.importar} />
                <ResumoMini label="Duplicadas" valor={preview.resumo.duplicada} />
                <ResumoMini label="Não elegíveis" valor={preview.resumo.nao_elegivel} />
                <ResumoMini label="Sem autorização" valor={preview.resumo.sem_autorizacao} />
                <ResumoMini label="Fora da área" valor={preview.resumo.fora_area} />
                <ResumoMini label="Menores" valor={preview.resumo.menor_idade} />
                <ResumoMini label="Erros" valor={preview.resumo.erro} />
              </div>
              <div className="max-h-80 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Idade</TableHead>
                      <TableHead>Município</TableHead>
                      <TableHead>Bairro/ref.</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>LGPD</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.linhas.slice(0, 120).map((linha, index) => (
                      <TableRow key={`${linha.linha}-${index}`}>
                        <TableCell>{linha.linha || "—"}</TableCell>
                        <TableCell>{linha.nome || "—"}</TableCell>
                        <TableCell className="max-w-56 truncate">{linha.email || "—"}</TableCell>
                        <TableCell>{linha.telefone || "—"}</TableCell>
                        <TableCell>{linha.idadeInformada || "—"}</TableCell>
                        <TableCell>{linha.municipio || "—"}</TableCell>
                        <TableCell className="max-w-52 truncate">
                          {linha.bairroReferencia || "—"}
                        </TableCell>
                        <TableCell>{turnoLabel(linha.turnoPreferido)}</TableCell>
                        <TableCell>{linha.autorizacaoDados ? "Sim" : "Não"}</TableCell>
                        <TableCell>
                          <div>{statusPreviewLabel(linha.status)}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {linha.foraArea ? (
                              <Badge
                                variant="outline"
                                className="border-orange-300 text-orange-800"
                              >
                                Fora da área
                              </Badge>
                            ) : null}
                            {linha.menorIdade ? (
                              <Badge
                                variant="outline"
                                className="border-purple-300 text-purple-800"
                              >
                                Menor de 18
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {linha.motivo}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={() => gerarPreview.mutate()}
            disabled={!arquivo || gerarPreview.isPending}
          >
            {gerarPreview.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Eye className="mr-2 size-4" />
            )}
            Gerar preview
          </Button>
          <Button
            onClick={() => confirmar.mutate()}
            disabled={!arquivo || !preview?.resumo.importar || confirmar.isPending}
          >
            {confirmar.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 size-4" />
            )}
            Confirmar importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumoMini({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{valor}</div>
    </div>
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
