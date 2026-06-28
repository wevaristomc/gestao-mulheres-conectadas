import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderPanel } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/pedagogico")({
  head: () => ({ meta: [{ title: "Pedagógico · Painel Mulheres Conectadas" }] }),
  component: () => (
    <div>
      <PageHeader title="Pedagógico" description="Turmas, cursistas, aulas, frequência e entregas." />
      <PlaceholderPanel
        title="Em construção"
        description="Aqui ficarão turmas, cursistas, matrículas, aulas, frequência e entregas de benefícios e materiais."
      />
    </div>
  ),
});