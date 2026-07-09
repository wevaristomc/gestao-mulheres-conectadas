import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle, CheckCircle2, Download, FileUp, HelpCircle, Loader2, Search,
  FolderOpen, ShieldCheck, RotateCcw, Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { turmasMteListOptions } from "@/lib/mte-queries";
import { lerListaPresenca } from "@/lib/ia.functions";
import { baixarPdfDoDrive } from "@/lib/leitor-drive.functions";
import { GDrivePicker, type GDriveFile } from "@/components/gdrive/gdrive-picker";
import { ImportarTurmaCsvCard } from "@/components/mte/importar-turma-csv-card";
import { ImportarMoodleCard } from "@/components/mte/importar-moodle-card";
import { GerarMatriculasAvaCard } from "@/components/mte/gerar-matriculas-ava-card";
import { SugestoesBeneficiariasAvaCard } from "@/components/mte/sugestoes-beneficiarias-ava-card";
import { CursosSemTurmaAvaCard } from "@/components/mte/cursos-sem-turma-ava-card";
import { ImportarConsolidadoCard } from "@/components/mte/importar-consolidado-card";
import {
  arquivoParaImagensBase64,
  carregarMatriculasDaTurma,
  confirmarImportacao,
  cruzarComMatriculas,
  gerarRelatorioTxt,
  baixarTxt,
  listarImportacoes,
  uploadArquivoLista,
  atualizarEnderecoTurma,
  atualizarProfessorTurma,
  marcarRevisaoImportacao,
  type ImportacaoLista,
  type RevisaoStatus,
  type CabecalhoExtraido,
  type LinhaConferencia,
  type MatriculaLite,
  type ResultadoLeitura,
} from "@/lib/leitor-lista";

export const Route = createFileRoute("/_authenticated/mte/importar-lista")({
  component: ImportarListaPage,
});

function ImportarListaPage() {
  const qc = useQueryClient();
  const turmasQ = useQuery(turmasMteListOptions());
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [origem, setOrigem] = useState<"local" | "drive" | null>(null);
  const [driveFileName, setDriveFileName] = useState<string | null>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [uploaded, setUploaded] = useState<{ url: string; nome: string } | null>(null);
  const [tipoDoc, setTipoDoc] = useState<
    "lista_presenca" | "ficha_inscricao" | "entrega_beneficios" | "relacao_qualificados"
  >("lista_presenca");

  const [cabecalho, setCabecalho] = useState<CabecalhoExtraido>({});
  const [linhas, setLinhas] = useState<LinhaConferencia[]>([]);
  const [observacoes, setObservacoes] = useState<string[]>([]);
  const [matriculas, setMatriculas] = useState<MatriculaLite[]>([]);
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null);

  const lerFn = useServerFn(lerListaPresenca);
  const baixarDriveFn = useServerFn(baixarPdfDoDrive);
  const historicoQ = useQuery({
    queryKey: ["mte", "importacoes-presenca", turmaId || null],
    queryFn: () => listarImportacoes(turmaId || null),
  });

  const turmaAtual = useMemo(
    () => turmas.find((t) => t.id === turmaId) ?? null,
    [turmas, turmaId],
  );

  async function base64ToFile(b64: string, mime: string, nome: string): Promise<File> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], nome, { type: mime });
  }

  async function onDrivePick(picked: GDriveFile[]) {
    const f = picked[0];
    if (!f) return;
    setDriveBusy(true);
    try {
      const dl = await baixarDriveFn({ data: { fileId: f.id } });
      const built = await base64ToFile(dl.base64, dl.mime, dl.nome);
      setFile(built);
      setOrigem("drive");
      setDriveFileName(dl.nome);
      setDrivePickerOpen(false);
      toast.success(`PDF carregado do Drive · ${dl.nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar do Drive");
    } finally {
      setDriveBusy(false);
    }
  }

  const processar = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione o PDF/imagem da lista.");
      if (!turmaId) throw new Error("Selecione a turma.");
      // 1. upload
      const up = await uploadArquivoLista(turmaId, file);
      setUploaded({ url: up.url, nome: file.name });
      // 2. pdf -> imagens
      const imagens = await arquivoParaImagensBase64(file);
      // 3. IA
      const res = (await lerFn({ data: { imagens } })) as ResultadoLeitura;
      setLeitura(res);
      setCabecalho(res.cabecalho ?? {});
      setObservacoes(res.observacoes ?? []);
      // 4. cruzar
      const mats = await carregarMatriculasDaTurma(turmaId);
      setMatriculas(mats);
      const cruzadas = cruzarComMatriculas(res.alunas, mats);
      setLinhas(cruzadas);
    },
    onSuccess: () => toast.success("Lista lida com sucesso — confira antes de gravar."),
    onError: (e: Error) => toast.error(e.message || "Falha ao processar"),
  });

  const confirmar = useMutation({
    mutationFn: async () => {
      if (!uploaded) throw new Error("Arquivo não enviado.");
      if (!turmaId) throw new Error("Turma inválida.");
      return confirmarImportacao({
        turmaId,
        arquivoUrl: uploaded.url,
        arquivoNome: uploaded.nome,
        cabecalho,
        linhas,
        observacoes,
        codigoTurma: turmaAtual?.codigo_turma ?? null,
        nomeCurso: turmaAtual?.nome_curso ?? null,
      });
    },
    onSuccess: (r) => {
      toast.success(
        `Aula registrada · ${r.presencas_registradas} presenças · ${r.lanches_registrados} lanches`,
      );
      qc.invalidateQueries({ queryKey: ["mte"] });
      qc.invalidateQueries({ queryKey: ["pedagogico"] });
      qc.invalidateQueries({ queryKey: ["administrativo"] });
      // reset
      setFile(null); setUploaded(null); setLeitura(null); setLinhas([]);
      setOrigem(null); setDriveFileName(null);
      setCabecalho({}); setObservacoes([]);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao gravar"),
  });

  const salvarEndereco = useMutation({
    mutationFn: async () => {
      if (!turmaId) throw new Error("Selecione a turma primeiro.");
      const end = String(cabecalho.endereco ?? "").trim();
      if (!end) throw new Error("Endereço vazio.");
      await atualizarEnderecoTurma(turmaId, end);
    },
    onSuccess: () => {
      toast.success("Endereço da turma atualizado.");
      qc.invalidateQueries({ queryKey: ["mte", "turmas"] });
      qc.invalidateQueries({ queryKey: ["pedagogico"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarProfessor = useMutation({
    mutationFn: async () => {
      if (!turmaId) throw new Error("Selecione a turma primeiro.");
      const nome = String(cabecalho.instrutor ?? "").trim();
      if (!nome) throw new Error("Nome do instrutor vazio.");
      await atualizarProfessorTurma(turmaId, nome);
    },
    onSuccess: () => {
      toast.success("Professor da turma atualizado.");
      qc.invalidateQueries({ queryKey: ["mte", "turmas"] });
      qc.invalidateQueries({ queryKey: ["pedagogico"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enderecoTurma = String((turmaAtual as any)?.local_endereco ?? "").trim();
  const enderecoLido = String(cabecalho.endereco ?? "").trim();
  const professorTurma = String((turmaAtual as any)?.professor_nome ?? "").trim();
  const professorLido = String(cabecalho.instrutor ?? "").trim();
  const enderecoDivergente = enderecoLido && enderecoLido.toLowerCase() !== enderecoTurma.toLowerCase();
  const professorDivergente = professorLido && professorLido.toLowerCase() !== professorTurma.toLowerCase();

  function atualizarLinha(idx: number, patch: Partial<LinhaConferencia>) {
    setLinhas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function vincularManual(idx: number, matriculaId: string | null) {
    const m = matriculaId ? matriculas.find((x) => x.matricula_id === matriculaId) ?? null : null;
    atualizarLinha(idx, {
      matricula_id: m?.matricula_id ?? null,
      beneficiaria_id: m?.beneficiaria_id ?? null,
      nome_matriculado: m?.nome ?? null,
      status: m ? "identificada" : "nao_identificada",
      motivo: m ? undefined : "Vínculo removido",
    });
  }

  const contadores = useMemo(() => ({
    total: linhas.length,
    ident: linhas.filter((l) => l.status === "identificada").length,
    divergencia: linhas.filter((l) => l.status === "divergencia").length,
    naoId: linhas.filter((l) => l.status === "nao_identificada").length,
    presentes: linhas.filter((l) => l.presente && l.matricula_id).length,
    lanches: linhas.filter((l) => l.lanche_sim && l.matricula_id).length,
  }), [linhas]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar Documento (PDF)"
        description="Selecione o tipo de documento — a IA extrai os dados, você confere e grava."
      />

      <ImportarTurmaCsvCard />
      <ImportarConsolidadoCard />
      <ImportarMoodleCard />
      <CursosSemTurmaAvaCard />
      <SugestoesBeneficiariasAvaCard />
      <GerarMatriculasAvaCard />

      <div className="rounded-md border p-4 space-y-2">
        <Label className="text-xs uppercase text-muted-foreground">Tipo de documento</Label>
        <Select value={tipoDoc} onValueChange={(v) => setTipoDoc(v as typeof tipoDoc)}>
          <SelectTrigger className="w-full md:w-96">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lista_presenca">Lista de Presença</SelectItem>
            <SelectItem value="ficha_inscricao">Ficha de Inscrição</SelectItem>
            <SelectItem value="entrega_beneficios">Lista de Entrega de Benefícios</SelectItem>
            <SelectItem value="relacao_qualificados">Relação de Qualificados preenchida</SelectItem>
          </SelectContent>
        </Select>
        {tipoDoc !== "lista_presenca" ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200">
            <strong>Pipeline em desenvolvimento.</strong> A leitura por IA para este tipo de
            documento está sendo preparada — em breve. Continue usando <em>Lista de Presença</em>
            para importar frequência e lanches.
          </div>
        ) : null}
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Turma *</Label>
            <Select value={turmaId} onValueChange={setTurmaId}>
              <SelectTrigger><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
              <SelectContent>
                {turmas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.codigo_turma ?? "?"} — {t.nome_curso ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Arquivo (PDF, JPG ou PNG) *</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    setOrigem(f ? "local" : null);
                    setDriveFileName(null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrivePickerOpen(true)}
                  disabled={driveBusy}
                >
                  {driveBusy
                    ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    : <FolderOpen className="mr-1.5 h-4 w-4" />}
                  Escolher do Google Drive
                </Button>
              </div>
              {file ? (
                <div className="text-xs text-muted-foreground">
                  Origem: {origem === "drive" ? (
                    <span className="font-medium text-foreground">Google Drive · {driveFileName ?? file.name}</span>
                  ) : (
                    <span className="font-medium text-foreground">Upload local · {file.name}</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => processar.mutate()} disabled={!file || !turmaId || processar.isPending}>
            {processar.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Search className="mr-2 h-4 w-4" />}
            Ler lista com IA
          </Button>
          {leitura ? (
            <div className="text-xs text-muted-foreground self-center">
              via <strong>{leitura.provedor}</strong> · {leitura.modelo} · {leitura.tokens} tokens
            </div>
          ) : null}
        </div>
        {processar.error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="whitespace-pre-wrap break-words">{(processar.error as Error).message}</div>
          </div>
        ) : null}
      </div>

      {leitura ? (
        <>
          <div className="rounded-md border p-4">
            <h3 className="mb-3 text-sm font-semibold">Cabeçalho extraído — corrija se necessário</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Turma identificada">
                <Input value={cabecalho.turma ?? ""} onChange={(e) => setCabecalho({ ...cabecalho, turma: e.target.value })} />
              </Field>
              <Field label="Data da aula (AAAA-MM-DD) *">
                <Input value={cabecalho.data ?? ""} onChange={(e) => setCabecalho({ ...cabecalho, data: e.target.value })} placeholder="2026-06-23" />
              </Field>
              <Field label="Instrutor/a">
                <Input value={cabecalho.instrutor ?? ""} onChange={(e) => setCabecalho({ ...cabecalho, instrutor: e.target.value })} />
              </Field>
              <Field label="Horário">
                <Input value={cabecalho.horario ?? ""} onChange={(e) => setCabecalho({ ...cabecalho, horario: e.target.value })} placeholder="08:00 às 12:00" />
              </Field>
              <Field label="CH do dia">
                <Input type="number" value={cabecalho.ch_dia ?? ""} onChange={(e) => setCabecalho({ ...cabecalho, ch_dia: Number(e.target.value) || null })} />
              </Field>
              <Field label="Conteúdo">
                <Input value={cabecalho.conteudo ?? ""} onChange={(e) => setCabecalho({ ...cabecalho, conteudo: e.target.value })} />
              </Field>
              <Field label="Endereço da unidade">
                <Input
                  value={cabecalho.endereco ?? ""}
                  onChange={(e) => setCabecalho({ ...cabecalho, endereco: e.target.value })}
                  placeholder="Rua, número, bairro, cidade"
                />
              </Field>
            </div>
            {(enderecoDivergente || professorDivergente) ? (
              <div className="mt-3 grid gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                {enderecoDivergente ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">Endereço lido difere do cadastro da turma</div>
                      <div className="text-muted-foreground">
                        Cadastro: <em>{enderecoTurma || "—"}</em> · Lido: <strong>{enderecoLido}</strong>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => salvarEndereco.mutate()} disabled={salvarEndereco.isPending}>
                      Atualizar endereço da turma
                    </Button>
                  </div>
                ) : null}
                {professorDivergente ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">Professor lido difere do cadastro da turma</div>
                      <div className="text-muted-foreground">
                        Cadastro: <em>{professorTurma || "—"}</em> · Lido: <strong>{professorLido}</strong>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => salvarProfessor.mutate()} disabled={salvarProfessor.isPending}>
                      Atualizar professor da turma
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Total: {contadores.total}</Badge>
            <Badge className="bg-emerald-100 text-emerald-800">✅ {contadores.ident} identificadas</Badge>
            <Badge className="bg-amber-100 text-amber-800">⚠️ {contadores.divergencia} divergências</Badge>
            <Badge className="bg-red-100 text-red-800">❌ {contadores.naoId} não identificadas</Badge>
            <Badge variant="outline">Presenças: {contadores.presentes}</Badge>
            <Badge variant="outline">Lanches: {contadores.lanches}</Badge>
          </div>

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Nome (OCR)</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-center">Presente</TableHead>
                  <TableHead className="text-center">Lanche</TableHead>
                  <TableHead>Vincular manualmente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l, i) => (
                  <TableRow key={i} className={
                    l.status === "identificada" ? "" :
                    l.status === "divergencia" ? "bg-amber-50/60" : "bg-red-50/60"
                  }>
                    <TableCell className="text-xs text-muted-foreground">{l.num ?? "?"}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.nome ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.cpf ?? <span className="italic text-muted-foreground">ilegível</span>}</TableCell>
                    <TableCell className="text-xs">
                      {l.status === "identificada" ? (
                        <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {l.nome_matriculado}</span>
                      ) : l.status === "divergencia" ? (
                        <span className="text-amber-700 inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {l.nome_matriculado ?? "—"}<br />{l.motivo}</span>
                      ) : (
                        <span className="text-red-700 inline-flex items-center gap-1"><HelpCircle className="h-3 w-3" /> {l.motivo ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={l.presente} onCheckedChange={(v) => atualizarLinha(i, { presente: v === true })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={l.lanche_sim} onCheckedChange={(v) => atualizarLinha(i, { lanche_sim: v === true })} />
                    </TableCell>
                    <TableCell>
                      <Select value={l.matricula_id ?? "__none__"} onValueChange={(v) => vincularManual(i, v === "__none__" ? null : v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— nenhuma —</SelectItem>
                          {matriculas.map((m) => (
                            <SelectItem key={m.matricula_id} value={m.matricula_id}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {observacoes.length ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">Avisos da IA</Label>
              <Textarea rows={3} value={observacoes.join("\n")} readOnly className="text-xs" />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
              {confirmar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Confirmar e registrar
            </Button>
            <Button
              variant="outline"
              onClick={() => baixarTxt(
                `relatorio-lista-${cabecalho.data ?? "sem-data"}.txt`,
                gerarRelatorioTxt({ cabecalho, linhas, observacoes }),
              )}
            >
              <Download className="mr-2 h-4 w-4" /> Baixar relatório .txt
            </Button>
          </div>
          {confirmar.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive whitespace-pre-wrap break-words">
              {(confirmar.error as Error).message}
            </div>
          ) : null}
          {confirmar.data ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-50 px-3 py-2 text-xs">
              Aula gravada · <strong>{confirmar.data.presencas_registradas}</strong> presenças · <strong>{confirmar.data.lanches_registrados}</strong> lanches · <strong>{confirmar.data.nao_identificadas.length}</strong> item(ns) não identificado(s).
            </div>
          ) : null}
        </>
      ) : null}

      <div className="rounded-md border">
        <div className="border-b px-4 py-2 text-sm font-semibold">Histórico de importações</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data aula</TableHead>
              <TableHead>Turma (lida)</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Não ident.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enviado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historicoQ.isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-xs text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : (historicoQ.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-xs text-muted-foreground">Nenhuma importação ainda.</TableCell></TableRow>
            ) : (historicoQ.data ?? []).map((h) => (
              <TableRow key={h.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => {
                  // Reabre para conferência (somente leitura das linhas gravadas)
                  setLinhas(h.itens ?? []);
                  setObservacoes(h.avisos ?? []);
                  setCabecalho({
                    turma: h.turma_identificada,
                    data: h.data_aula,
                    conteudo: (h as any).conteudo,
                    instrutor: (h as any).instrutor,
                    horario: (h as any).horario,
                    ch_dia: (h as any).ch_dia,
                  });
                  setUploaded(h.arquivo_url ? { url: h.arquivo_url, nome: h.arquivo_nome ?? "" } : null);
                  setLeitura({ cabecalho: {}, alunas: [], observacoes: [], provedor: "histórico", modelo: "", tokens: 0 });
                }}
              >
                <TableCell className="text-xs">{h.data_aula ?? "—"}</TableCell>
                <TableCell className="text-xs">{h.turma_identificada ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {h.arquivo_url ? <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={h.arquivo_url}>{h.arquivo_nome ?? "abrir"}</a> : "—"}
                </TableCell>
                <TableCell className="text-xs">{(h.itens ?? []).length}</TableCell>
                <TableCell className="text-xs">{(h.nao_identificados ?? []).length}</TableCell>
                <TableCell className="text-xs capitalize">{h.status}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{h.criado_em ? new Date(h.criado_em).toLocaleString("pt-BR") : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}