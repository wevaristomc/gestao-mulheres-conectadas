import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderPanel } from "@/components/page-header";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("financeiro"),
  component: () => (
    <div>
      <PageHeader title="Financeiro" description="Orçamento, cotações, propostas, fornecedores e despesas." />
      <PlaceholderPanel
        title="Em construção"
        description="Itens orçamentários, cotações com propostas, fornecedores e execução de despesas comporão este módulo."
      />
    </div>
  ),
});