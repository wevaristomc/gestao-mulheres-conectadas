import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderPanel } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/captacao")({
  head: () => ({ meta: [{ title: "Captação · Painel Mulheres Conectadas" }] }),
  component: () => (
    <div>
      <PageHeader title="Captação" description="Editais, propostas e acompanhamento de novas parcerias." />
      <PlaceholderPanel
        title="Em construção"
        description="Pipeline de captação de novos termos de fomento e contratos será exibido nesta área."
      />
    </div>
  ),
});