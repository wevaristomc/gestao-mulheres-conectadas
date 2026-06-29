import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderPanel } from "@/components/page-header";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("configuracoes"),
  component: () => (
    <div>
      <PageHeader title="Configurações" description="Usuários, papéis e parâmetros do projeto." />
      <PlaceholderPanel
        title="Em construção"
        description="Gestão de usuários, atribuição de papéis e parâmetros gerais do projeto serão configurados aqui."
      />
    </div>
  ),
});