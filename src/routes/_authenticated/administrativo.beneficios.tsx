import { createFileRoute } from "@tanstack/react-router";
import { EntregasTab } from "@/components/entregas-tab";

export const Route = createFileRoute("/_authenticated/administrativo/beneficios")({
  component: () => (
    <EntregasTab
      tabela="entregas_beneficios"
      titulo="Benefícios"
      labelDescricao="Benefício"
      mostrarValor={true}
      statuses={["previsto", "aprovado", "entregue", "cancelado"]}
    />
  ),
});