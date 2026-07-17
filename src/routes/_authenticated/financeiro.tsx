import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { Progress } from "@/components/ui/progress";
import { requireModuleAccess } from "@/lib/auth-guard";
import { cn } from "@/lib/utils";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  despesasListOptions,
  formatBRL,
  orcamentoItensOptions,
  toNumber,
} from "@/lib/financeiro-queries";
import { rubricasListOptions } from "@/lib/rubricas-queries";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("financeiro"),
  component: FinanceiroLayout,
});

function FinanceiroLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { projetoId } = useActiveContext();
  const orcamentoQ = useQuery(orcamentoItensOptions(projetoId));
  const despesasQ = useQuery(despesasListOptions(projetoId));
  const rubricasQ = useQuery(rubricasListOptions());

  const itensOrcamento = orcamentoQ.data?.rows ?? [];
  const rubricas = rubricasQ.data?.rows ?? [];
  const despesas = despesasQ.data?.rows ?? [];
  const previstoOrcamento = itensOrcamento.reduce(
    (total, row) => total + toNumber(row.valor_previsto),
    0,
  );
  const previstoRubricas = rubricas.reduce((total, row) => total + toNumber(row.valor_previsto), 0);
  const previsto = previstoOrcamento > 0 ? previstoOrcamento : previstoRubricas;
  const executadoDespesas = despesas
    .filter((row) => String(row.status ?? "").toLowerCase() !== "cancelada")
    .reduce((total, row) => total + toNumber(row.valor), 0);
  const executadoOrcamento = itensOrcamento.reduce(
    (total, row) => total + toNumber(row.valor_executado),
    0,
  );
  const executado = despesas.length > 0 ? executadoDespesas : executadoOrcamento;
  const saldo = previsto - executado;
  const percentual = previsto > 0 ? (executado / previsto) * 100 : 0;
  const loading = orcamentoQ.isLoading || despesasQ.isLoading || rubricasQ.isLoading;
  const semDados = !loading && !!orcamentoQ.data?.error && !!rubricasQ.data?.error;

  const tabs = [
    { to: "/financeiro/orcamento", label: "Orçamento" },
    { to: "/financeiro/despesas", label: "Despesas" },
    { to: "/financeiro/conciliacao", label: "Conciliação bancária" },
    { to: "/financeiro/fornecedores", label: "Fornecedores" },
    { to: "/financeiro/rubricas", label: "Rubricas" },
    { to: "/financeiro/relacoes-horas", label: "Relações de Horas" },
  ];

  return (
    <div>
      <PageHeader
        helpId="cotacoes.tres"
        title="Financeiro"
        description="Orçamento, despesas, rubricas, fornecedores e conferência dos pagamentos do projeto."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Previsto"
          value={formatBRL(previsto)}
          loading={loading}
          erro={semDados}
          hint={previstoOrcamento > 0 ? "Itens do orçamento" : "Plano de rubricas"}
        />
        <KpiCard
          label="Executado"
          value={formatBRL(executado)}
          loading={loading}
          erro={semDados}
          hint="Despesas não canceladas"
        />
        <KpiCard
          label="Saldo"
          value={formatBRL(saldo)}
          loading={loading}
          erro={semDados}
          hint={saldo < 0 ? "Acima do previsto" : "Disponível para execução"}
          tone={saldo < 0 ? "negative" : "neutral"}
        />
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">% Execução</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? "…" : semDados ? "—" : `${percentual.toFixed(1)}%`}
          </div>
          <Progress value={Math.min(percentual, 100)} className="mt-3 h-2" />
        </div>
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  erro,
  hint,
  tone,
}: {
  label: string;
  value: string;
  loading: boolean;
  erro: boolean;
  hint?: string;
  tone?: "neutral" | "negative";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "negative" ? "text-destructive" : "text-foreground",
        )}
      >
        {loading ? "…" : erro ? "—" : value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
