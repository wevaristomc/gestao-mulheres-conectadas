import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireModuleAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("whatsapp"),
  component: () => <Outlet />,
});