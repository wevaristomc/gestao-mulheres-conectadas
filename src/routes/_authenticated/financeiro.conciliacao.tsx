import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveContext } from "@/hooks/use-active-context";
import { entregasListOptions, pickFirst, type Row } from "@/lib/administrativo-queries";
import {
  excluirImportacaoExtrato,
  importarEConciliar,
  importacoesExtratoOptions,
} from "@/lib/conciliacao-queries";
import { downloadCSV, toCSV } from "@/lib/csv";
import {
  lerArquivoExtrato,
  pontuarCorrespondencia,
  type ResultadoExtrato,
} from "@/lib/extrato-bancario";
import { formatBRL, formatarData } from "@/lib/financeiro-queries";

export const Route = createFileRoute("/_authenticated/financeiro/conciliacao")({ component: Page });

type Beneficio = {
  id: string;
  nome: string;
  valor: number;
  descricao: string;
  status: string;
  data: string | null;
  cpf: string | null;
  conta: string | null;
};
const mesAtual = () => new Date().toISOString().slice(0, 7);

function toBeneficio(row: Row): Beneficio {
  const cursista = (row.cursistas as Row | null | undefined) ?? null;
  const beneficiaria = (row.beneficiarias as Row | null | undefined) ?? null;
  return {
    id: row.id,
    nome:
      (pickFirst(beneficiaria, ["nome", "nome_completo"]) as string | null) ??
      (pickFirst(cursista, ["nome", "nome_completo"]) as string | null) ??
      "Beneficiária não identificada",
    valor: Number(row.valor ?? 0),
    descricao: String(row.descricao ?? "Benefício"),
    status: String(row.status ?? "previsto"),
    data: row.data_entrega ? String(row.data_entrega) : null,
    cpf:
      (pickFirst(beneficiaria, ["cpf"]) as string | null) ??
      (pickFirst(cursista, ["cpf"]) as string | null) ??
      null,
    conta: (pickFirst(beneficiaria, ["conta"]) as string | null) ?? null,
  };
}

function Page() {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const beneficiosQ = useQuery(entregasListOptions("entregas_beneficios", projetoId));
  const importacoesQ = useQuery(importacoesExtratoOptions(projetoId));
  const beneficios = useMemo(
    () => (beneficiosQ.data?.rows ?? []).map(toBeneficio),
    [beneficiosQ.data?.rows],
  );
  const pendentes = useMemo(
    () =>
      beneficios.filter(
        (item) => !["entregue", "pago", "cancelado"].includes(item.status.toLowerCase()),
      ),
    [beneficios],
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoExtrato | null>(null);
  const [referencia, setReferencia] = useState(mesAtual());
  const [selecoes, setSelecoes] = useState<Record<number, string>>({});
  const [scores, setScores] = useState<Record<number, number>>({});
  const [lendo, setLendo] = useState(false);

  const processar = async (file: File) => {
    setLendo(true);
    try {
      const parsed = await lerArquivoExtrato(file);
      const escolhas: Record<number, string> = {};
      const pontos: Record<number, number> = {};
      const usados = new Set<string>();
      parsed.lancamentos.forEach((lancamento, index) => {
        if (lancamento.tipo !== "debito") return;
        const candidatos = pendentes
          .map((beneficio) => ({ beneficio, score: pontuarCorrespondencia(lancamento, beneficio) }))
          .sort((a, b) => b.score - a.score);
        const [primeiro, segundo] = candidatos;
        if (
          primeiro &&
          primeiro.score >= 80 &&
          primeiro.score - (segundo?.score ?? 0) >= 10 &&
          !usados.has(primeiro.beneficio.id)
        ) {
          escolhas[index] = primeiro.beneficio.id;
          pontos[index] = primeiro.score;
          usados.add(primeiro.beneficio.id);
        }
      });
      setArquivo(file);
      setResultado(parsed);
      setSelecoes(escolhas);
      setScores(pontos);
      toast.success(`${parsed.lancamentos.length} lançamentos reconhecidos.`);
    } catch (error) {
      setArquivo(null);
      setResultado(null);
      setSelecoes({});
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o extrato.");
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!projetoId || !arquivo || !resultado) throw new Error("Selecione um extrato CSV.");
      const ids = Object.values(selecoes).filter(Boolean);
      if (new Set(ids).size !== ids.length)
        throw new Error("Uma beneficiária não pode ser vinculada a dois lançamentos.");
      return importarEConciliar({
        projetoId,
        nomeArquivo: arquivo.name,
        referencia: referencia || null,
        lancamentos: resultado.lancamentos,
        escolhas: Object.entries(selecoes)
          .filter(([, id]) => !!id)
          .map(([index, beneficioId]) => ({
            lancamentoIndex: Number(index),
            beneficioId,
            score: scores[Number(index)] ?? 0,
          })),
      });
    },
    onSuccess: (data) => {
      toast.success(`Extrato importado com ${data.conciliados} pagamento(s) conciliado(s).`);
      setArquivo(null);
      setResultado(null);
      setSelecoes({});
      qc.invalidateQueries({ queryKey: ["financeiro", "extratos"] });
      qc.invalidateQueries({ queryKey: ["administrativo", "entregas_beneficios"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const excluir = useMutation({
    mutationFn: excluirImportacaoExtrato,
    onSuccess: () => {
      toast.success("Importação removida.");
      qc.invalidateQueries({ queryKey: ["financeiro", "extratos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lancamentos = resultado?.lancamentos ?? [];
  const debitos = lancamentos.filter((item) => item.tipo === "debito");
  const totalDebitos = debitos.reduce((sum, item) => sum + item.valor, 0);
  const conciliados = Object.values(selecoes).filter(Boolean).length;

  const exportar = () => {
    const pagos = beneficios.filter((item) =>
      ["entregue", "pago"].includes(item.status.toLowerCase()),
    );
    downloadCSV(
      `pagamentos-beneficiarias-${referencia || mesAtual()}.csv`,
      toCSV(
        pagos.map((item) => ({
          Beneficiária: item.nome,
          Benefício: item.descricao,
          Valor: item.valor.toFixed(2).replace(".", ","),
          "Data do pagamento": item.data ? formatarData(item.data) : "",
          Status: "Pago",
        })),
        ["Beneficiária", "Benefício", "Valor", "Data do pagamento", "Status"],
      ),
    );
    toast.success(`${pagos.length} pagamento(s) exportado(s).`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Importar extrato bancário</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Envie o CSV do banco. Débitos são cruzados com benefícios pelo nome e valor; casos
              ambíguos ficam para confirmação manual.
            </p>
          </div>
          <Button variant="outline" onClick={exportar} disabled={!beneficios.length}>
            <Download className="mr-2 h-4 w-4" /> Relatório de pagamentos
          </Button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <Label htmlFor="mes-referencia">Mês de referência</Label>
            <Input
              id="mes-referencia"
              className="mt-1"
              type="month"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="arquivo-extrato">Arquivo CSV</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                ref={inputRef}
                id="arquivo-extrato"
                className="max-w-xl"
                type="file"
                accept=".csv,text/csv,.txt"
                disabled={lendo || !projetoId}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void processar(file);
                }}
              />
              {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </div>
          </div>
        </div>
        {arquivo && resultado ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Resumo label="Arquivo" value={arquivo.name} />
            <Resumo label="Lançamentos" value={String(lancamentos.length)} />
            <Resumo label="Total de débitos" value={formatBRL(totalDebitos)} />
            <Resumo label="Correspondências" value={`${conciliados} de ${debitos.length}`} />
          </div>
        ) : null}
      </section>

      {resultado ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-56 flex-1">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Pagamentos identificados</span>
                <span>
                  {debitos.length ? ((conciliados / debitos.length) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <Progress
                value={debitos.length ? (conciliados / debitos.length) * 100 : 0}
                className="h-2"
              />
            </div>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !projetoId}>
              {salvar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Importar e confirmar {conciliados} pagamento(s)
            </Button>
          </div>
          {resultado.ignoradas.length ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              {resultado.ignoradas.length} linha(s) ignoradas por data ou valor inválidos.
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nome / histórico</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="min-w-72">Beneficiária correspondente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.map((row, index) => {
                  const selected = selecoes[index] ?? "";
                  const duplicate =
                    !!selected &&
                    Object.entries(selecoes).some(
                      ([key, id]) => Number(key) !== index && id === selected,
                    );
                  return (
                    <TableRow
                      key={`${row.linha}-${index}`}
                      className={row.tipo === "credito" ? "opacity-60" : undefined}
                    >
                      <TableCell className="whitespace-nowrap">{formatarData(row.data)}</TableCell>
                      <TableCell>
                        <Badge variant={row.tipo === "debito" ? "secondary" : "outline"}>
                          {row.tipo === "debito" ? "Débito" : "Crédito"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.contraparte || "Nome não informado"}</div>
                        <div className="max-w-md truncate text-xs text-muted-foreground">
                          {row.descricao || row.documento || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBRL(row.valor)}
                      </TableCell>
                      <TableCell>
                        {row.tipo === "credito" ? (
                          <span className="text-sm text-muted-foreground">Não é pagamento</span>
                        ) : (
                          <div>
                            <select
                              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                              value={selected}
                              onChange={(e) => {
                                const id = e.target.value;
                                const b = pendentes.find((item) => item.id === id);
                                setSelecoes((old) => ({ ...old, [index]: id }));
                                setScores((old) => ({
                                  ...old,
                                  [index]: b ? pontuarCorrespondencia(row, b) : 0,
                                }));
                              }}
                            >
                              <option value="">Não conciliado</option>
                              {pendentes.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.nome} — {formatBRL(b.valor)}
                                </option>
                              ))}
                            </select>
                            {duplicate ? (
                              <div className="mt-1 text-xs text-destructive">
                                Beneficiária já selecionada.
                              </div>
                            ) : null}
                            {!duplicate && selected && (scores[index] ?? 0) >= 80 ? (
                              <div className="mt-1 text-xs text-emerald-700">
                                Correspondência forte ({scores[index]}%)
                              </div>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 font-medium">Selecione o CSV enviado pelo banco</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Aceita ponto e vírgula, vírgula ou tabulação.
          </div>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          <h2 className="font-semibold">Importações recentes</h2>
        </div>
        {importacoesQ.data?.error ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            A estrutura ainda não foi instalada. Execute{" "}
            <code>docs/migrations/conciliacao-bancaria.sql</code> no Supabase.
          </div>
        ) : (
          <div className="rounded-md border">
            {(importacoesQ.data?.rows ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhum extrato importado.
              </div>
            ) : (
              <ul className="divide-y">
                {(importacoesQ.data?.rows ?? []).map((raw) => {
                  const row = raw as Record<string, unknown> & { id: string };
                  const itens =
                    (row.extrato_lancamentos as Array<{ conciliado: boolean }> | null) ?? [];
                  return (
                    <li key={row.id} className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <div className="font-medium">{String(row.nome_arquivo ?? "Extrato")}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatarData(String(row.criado_em ?? ""))} · {itens.length} lançamentos ·{" "}
                          {itens.filter((i) => i.conciliado).length} conciliados
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={excluir.isPending}
                        onClick={() => {
                          if (confirm("Excluir esta importação e suas conciliações?"))
                            excluir.mutate(row.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Resumo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}
