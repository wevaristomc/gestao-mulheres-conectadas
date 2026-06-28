import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  GraduationCap,
  Wallet,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "Visão Geral · Painel Mulheres Conectadas" }],
  }),
  component: VisaoGeralPage,
});

type Kpi = {
  key: string;
  label: string;
  icon: LucideIcon;
  hint: string;
};

const KPIS: Kpi[] = [
  { key: "cursistas", label: "Cursistas ativas", icon: Users, hint: "Matrículas ativas no projeto" },
  { key: "turmas", label: "Turmas em andamento", icon: GraduationCap, hint: "Turmas com aulas em curso" },
  { key: "execucao", label: "Execução orçamentária", icon: Wallet, hint: "% do orçamento executado" },
  { key: "pendencias", label: "Pendências abertas", icon: AlertCircle, hint: "Itens aguardando ação" },
];

function VisaoGeralPage() {
  return (
    <div>
      <PageHeader
        title="Visão Geral"
        description="Resumo executivo do projeto ativo. Os indicadores serão preenchidos ao conectar o backend."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.key} className="border-border/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.label}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight text-foreground">—</div>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}