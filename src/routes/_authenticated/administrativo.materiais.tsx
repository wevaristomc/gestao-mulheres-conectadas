import { createFileRoute } from "@tanstack/react-router";
import { EntregasTab } from "@/components/entregas-tab";

export const Route = createFileRoute("/_authenticated/administrativo/materiais")({
  component: () => (
    <EntregasTab
      tabela="entregas_materiais"
      titulo="Materiais"
      labelDescricao="Material"
      mostrarValor={false}
      statuses={["previsto", "separado", "entregue", "devolvido"]}
    />
  ),
});