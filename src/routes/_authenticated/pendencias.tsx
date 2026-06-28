import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderPanel } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/pendencias")({
  head: () => ({ meta: [{ title: "Pendências · Painel Mulheres Conectadas" }] }),
  component: () => (
    <div>
      <PageHeader title="Pendências" description="Itens aguardando ação no projeto ativo." />
      <PlaceholderPanel
        title="Em construção"
        description="A lista de pendências, com filtros por responsável, prazo e severidade, será disponibilizada nas próximas iterações."
      />
    </div>
  ),
});