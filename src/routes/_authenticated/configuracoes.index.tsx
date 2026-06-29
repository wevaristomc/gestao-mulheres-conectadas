import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPanel } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  component: () => (
    <PlaceholderPanel
      title="Parâmetros gerais"
      description="Configurações gerais do projeto serão exibidas aqui em breve. Para gerenciar acessos, abra a aba Usuários."
    />
  ),
});