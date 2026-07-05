import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/pedagogico/turmas/$id/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/pedagogico/turmas/$id/aulas", params: { id: params.id } });
  },
});