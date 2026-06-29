import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderPanel } from "@/components/page-header";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/administrativo")({
  head: () => ({ meta: [{ title: "Administrativo · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("administrativo"),
  component: () => (
    <div>
      <PageHeader title="Administrativo" description="Documentos, qualificados e gestão de cadastros." />
      <PlaceholderPanel
        title="Em construção"
        description="Cadastros, documentos do projeto e dados de qualificadas/qualificados serão organizados aqui."
      />
    </div>
  ),
});