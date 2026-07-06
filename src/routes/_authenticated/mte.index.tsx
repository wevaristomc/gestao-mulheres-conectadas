import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mte/")({
  beforeLoad: () => {
    throw redirect({ to: "/mte/turmas" });
  },
});