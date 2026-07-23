import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AnaliseIA } from "@/components/analise-ia";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveContext } from "@/hooks/use-active-context";
import { requireModuleAccess } from "@/lib/auth-guard";
import { formatarDataBR } from "@/lib/date-utils";
import {
  agregarDashboard,
  exportarDashboardXlsx,
  type DashboardInscricoes,
} from "@/lib/inscricoes-dashboard";
import {
  listarInscricoesDigitais,
  reprocessarIdadesInscricoes,
} from "@/lib/inscricoes-digitais.functions";

export const Route = createFileRoute("/_authenticated/administrativo/inscricoes-dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard de Inscrições · Administrativo" },
      {
        name: "description",
        content:
          "Painel geral, distribuição por região, faixa etária, perfil social e bairros das pré-inscrições.",
      },
    ],
  }),
  beforeLoad: () => requireModuleAccess("administrativo"),
  component: DashboardInscricoesPage,
});

const CORES = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#14b8a6", "#e11d48"];

function fmtInt(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}
function fmtPct(n: number | null | undefined, casas = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(casas)}%`;
}
function fmtNum(n: number | null | undefined, casas = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(casas);
}

function DashboardInscricoesPage() {
  const { projetoId, projetoNome } = useActiveContext();
  const listar = useServerFn(listarInscricoesDigitais);
  const reprocessar = useServerFn(reprocessarIdadesInscricoes);
  const queryClient = useQueryClient();
  const [reprocessando, setReprocessando] = useState(false);

  const q = useQuery({
    queryKey: ["inscricoes", "dashboard", projetoId],
    enabled: !!projetoId,
    queryFn: async () => {
      const rows = await listar({ data: { projetoId: projetoId! } });
      return agregarDashboard(rows);
    },
  });

  const dash = q.data;

  const contexto = useMemo(() => {
    if (!dash) return null;
    return JSON.stringify({
      totais: {
        respostas: dash.respostasRecebidas,
        unicas: dash.candidatasUnicas,
        duplicadas: dash.duplicidadesRemovidas,
        betim_pct: dash.concentracaoBetim,
      },
      indicadores: dash.indicadores,
      regioes: dash.regioes.slice(0, 15),
      faixas: dash.faixas,
      situacao_trabalho: dash.situacaoTrabalho,
      renda: dash.rendaFamiliar,
      programa_social: dash.programaSocial,
      bairros_top: dash.bairrosBetim.slice(0, 15),
    });
  }, [dash]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/administrativo/inscricoes"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar para Inscrições
          </Link>
          <PageHeader
            title="Dashboard de Inscrições"
            description={
              projetoNome
                ? `Projeto ${projetoNome} · base tratada em tempo real`
                : "Base tratada em tempo real"
            }
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!projetoId || reprocessando}
            onClick={async () => {
              if (!projetoId) return;
              setReprocessando(true);
              try {
                const r = await reprocessar({ data: { projetoId } });
                toast.success(
                  `Idades atualizadas: ${r.atualizadas} · sem idade: ${r.semIdade} · total: ${r.total}`,
                );
                await queryClient.invalidateQueries({ queryKey: ["inscricoes", "dashboard"] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao reprocessar idades");
              } finally {
                setReprocessando(false);
              }
            }}
          >
            {reprocessando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Reprocessar idades
          </Button>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={() => dash && exportarDashboardXlsx(dash, projetoNome)}
            disabled={!dash}
          >
            <Download className="mr-2 h-4 w-4" /> Exportar XLSX
          </Button>
        </div>
      </div>

      {!projetoId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Selecione um projeto para visualizar o dashboard.
          </CardContent>
        </Card>
      ) : q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Não foi possível carregar o dashboard: {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : dash ? (
        <PainelCompleto dash={dash} projetoNome={projetoNome} contexto={contexto} />
      ) : null}
    </div>
  );
}

function CardKpi({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">{valor}</div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function PainelCompleto({
  dash,
  projetoNome,
  contexto,
}: {
  dash: DashboardInscricoes;
  projetoNome: string | null;
  contexto: string | null;
}) {
  return (
    <>
      {/* Painel Geral */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Painel geral</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <CardKpi titulo="Respostas recebidas" valor={fmtInt(dash.respostasRecebidas)} />
          <CardKpi titulo="Candidatas únicas" valor={fmtInt(dash.candidatasUnicas)} />
          <CardKpi titulo="Duplicidades removidas" valor={fmtInt(dash.duplicidadesRemovidas)} />
          <CardKpi titulo="Concentração em Betim" valor={fmtPct(dash.concentracaoBetim)} />
        </div>

        <h3 className="mt-6 mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Indicadores principais
        </h3>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <CardKpi titulo="Idade média" valor={fmtNum(dash.indicadores.idadeMedia)} />
          <CardKpi titulo="Mediana de idade" valor={fmtNum(dash.indicadores.idadeMediana, 0)} />
          <CardKpi titulo="Não trabalhando" valor={fmtInt(dash.indicadores.naoTrabalhando)} />
          <CardKpi titulo="Até 1 SM" valor={fmtInt(dash.indicadores.ate1SM)} />
          <CardKpi titulo="Programa social" valor={fmtInt(dash.indicadores.beneficiariasPS)} />
          <CardKpi titulo="Multi-turno" valor={fmtInt(dash.indicadores.disponMultiTurno)} />
          <CardKpi titulo="Elegíveis preliminarmente" valor={fmtInt(dash.indicadores.elegiveisPrelim)} />
          <CardKpi titulo="Cadastros para revisão" valor={fmtInt(dash.indicadores.cadastrosRevisao)} />
          <CardKpi titulo="Restrição alimentar" valor={fmtInt(dash.indicadores.restricaoAlimentar)} />
          <CardKpi titulo="Deficiência/necessidade" valor={fmtInt(dash.indicadores.pcd)} />
        </div>

        <AnaliseIA
          aba="metas"
          projetoNome={projetoNome}
          getContexto={() => contexto}
          disabled={!contexto}
        />
      </section>

      {/* Por Região */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Distribuição por região / município</h2>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Candidatas por cidade</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dash.regioes.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="cidade" type="category" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="candidatas" fill={CORES[0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cidade</TableHead>
                    <TableHead className="text-right">Candidatas</TableHead>
                    <TableHead className="text-right">% base</TableHead>
                    <TableHead className="text-right">Idade média</TableHead>
                    <TableHead className="text-right">Não trab.</TableHead>
                    <TableHead className="text-right">Até 1 SM</TableHead>
                    <TableHead className="text-right">PS</TableHead>
                    <TableHead className="text-right">Manhã</TableHead>
                    <TableHead className="text-right">Tarde</TableHead>
                    <TableHead className="text-right">Noite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dash.regioes.map((r) => (
                    <TableRow key={r.cidade}>
                      <TableCell className="font-medium">{r.cidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.candidatas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(r.pctBase)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.idadeMedia)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.naoTrabalhando)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.ate1SM)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.programaSocial)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.manha)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.tarde)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.noite)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Faixa Etária */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Perfil etário</h2>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-sm">Candidatas por faixa etária</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dash.faixas}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="manha" stackId="t" fill={CORES[1]} name="Manhã" />
                  <Bar dataKey="tarde" stackId="t" fill={CORES[2]} name="Tarde" />
                  <Bar dataKey="noite" stackId="t" fill={CORES[3]} name="Noite" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faixa</TableHead>
                    <TableHead className="text-right">Candidatas</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Até 1 SM</TableHead>
                    <TableHead className="text-right">PS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dash.faixas.map((f) => (
                    <TableRow key={f.key}>
                      <TableCell className="font-medium">{f.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(f.candidatas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(f.pctBase)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(f.ate1SM)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(f.programaSocial)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Perfil Social */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Perfil social</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <DonutCard titulo="Situação de trabalho" dados={dash.situacaoTrabalho} />
          <DonutCard titulo="Renda familiar" dados={dash.rendaFamiliar} />
          <DonutCard titulo="Programa social" dados={dash.programaSocial} />
        </div>
      </section>

      {/* Bairros de Betim */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Bairros de Betim</h2>
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            {dash.bairrosBetim.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Sem dados de bairro nas inscrições de Betim.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bairro</TableHead>
                    <TableHead className="text-right">Candidatas</TableHead>
                    <TableHead className="text-right">% Betim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dash.bairrosBetim.map((b) => (
                    <TableRow key={b.rotulo}>
                      <TableCell>{b.rotulo}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(b.valor)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(b.pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Pendências */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Cadastros para revisão</h2>
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            {dash.pendencias.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhum cadastro em revisão. 🎉
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dash.pendencias.slice(0, 100).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.motivo}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatarDataBR(p.criadoEm)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function DonutCard({
  titulo,
  dados,
}: {
  titulo: string;
  dados: { rotulo: string; valor: number; pct: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {dados.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem dados
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={dados} dataKey="valor" nameKey="rotulo" outerRadius={80} innerRadius={45}>
                {dados.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}