import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/pedagogico")({
  head: () => ({ meta: [{ title: "Pedagógico · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("pedagogico"),
  component: () => <Outlet />,
});
