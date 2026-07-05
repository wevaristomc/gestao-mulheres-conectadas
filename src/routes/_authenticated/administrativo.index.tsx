import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/administrativo/")({
  beforeLoad: () => {
    throw redirect({ to: "/administrativo/qualificacao" });
  },
});