import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { Progress } from "@/components/ui/progress";
import { requireModuleAccess } from "@/lib/auth-guard";
import { cn } from "@/lib/utils";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  orcamentoItensOptions,
  despesasListOptions,
  formatBRL,
  toNumber,
} from "@/lib/financeiro-queries";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("financeiro"),
  component: FinanceiroLayout,
});

function FinanceiroLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { projetoId } = useActiveContext();
  const orcQ = useQuery(orcamentoItensOptions(projetoId));
  const despQ = useQuery(despesasListOptions(projetoId));

  const rows = orcQ.data?.rows ?? [];
  const previsto = rows.reduce((s, r) => s + toNumber(r.valor_previsto), 0);
  // Executado autoritativo vem do somatório das despesas; se indisponível,
  // usa o campo agregado da tabela de orçamento.
  const despesas = despQ.data?.rows ?? [];
  const executadoDespesas = despesas.reduce((s, r) => s + toNumber(r.valor), 0);
  const executadoOrc = rows.reduce((s, r) => s + toNumber(r.valor_executado), 0);
  const executado = despesas.length > 0 ? executadoDespesas : executadoOrc;
  const saldo = previsto - executado;
  const pct = previsto > 0 ? (executado / previsto) * 100 : 0;
  const loading = orcQ.isLoading || despQ.isLoading;
  const semDados = !loading && !!orcQ.data?.error;

  const tabs = [
    { to: "/financeiro/orcamento", label: "Orçamento" },
    { to: "/financeiro/despesas", label: "Despesas" },
    { to: "/financeiro/fornecedores", label: "Fornecedores" },
  ];

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Orçamento previsto vs executado, fornecedores e despesas do projeto."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Previsto" value={formatBRL(previsto)} loading={loading} erro={semDados} />
        <KpiCard label="Executado" value={formatBRL(executado)} loading={loading} erro={semDados} />
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
            {loading ? "…" : semDados ? "—" : `${pct.toFixed(1)}%`}
          </div>
          <Progress value={Math.min(pct, 100)} className="mt-3 h-2" />
        </div>
      </div>

      <nav className="mb-4 flex gap-1 border-b">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "border-b-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
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