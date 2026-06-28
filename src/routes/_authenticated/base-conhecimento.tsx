import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderPanel } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/base-conhecimento")({
  head: () => ({ meta: [{ title: "Base de Conhecimento · Painel Mulheres Conectadas" }] }),
  component: () => (
    <div>
      <PageHeader title="Base de Conhecimento" description="Documentação, normas e materiais de apoio." />
      <PlaceholderPanel
        title="Em construção"
        description="Modelos, anexos do Termo de Fomento e materiais de referência ficarão acessíveis aqui."
      />
    </div>
  ),
});