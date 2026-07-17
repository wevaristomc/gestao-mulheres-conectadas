import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  isStaleRouteAssetError,
  recoverStaleRouteAsset,
  reloadCurrentRoute,
} from "../lib/navigation-recovery";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço informado não existe ou foi alterado.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const staleAsset = isStaleRouteAssetError(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    recoverStaleRouteAsset(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar esta tela
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {staleAsset
            ? "O sistema foi atualizado ou a conexão oscilou. Recarregue para continuar nesta mesma tela."
            : "Ocorreu uma falha inesperada. Tente novamente sem sair da sua sessão."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (staleAsset) {
                reloadCurrentRoute();
                return;
              }
              reset();
              void router.invalidate();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {staleAsset ? "Recarregar esta tela" : "Tentar novamente"}
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Painel Mulheres Conectadas" },
      {
        name: "description",
        content:
          "Painel administrativo do projeto Mulheres Conectadas — gestão pedagógica, administrativa e financeira do Termo de Fomento.",
      },
      { property: "og:title", content: "Painel Mulheres Conectadas" },
      {
        property: "og:description",
        content:
          "Gestão integrada do projeto social de qualificação profissional Mulheres Conectadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Painel Mulheres Conectadas" },
      { name: "description", content: "Painel administrativo web para gestão de projetos sociais de qualificação profissional." },
      { property: "og:description", content: "Painel administrativo web para gestão de projetos sociais de qualificação profissional." },
      { name: "twitter:description", content: "Painel administrativo web para gestão de projetos sociais de qualificação profissional." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/de2d90d8-54db-41a7-ac6a-e6fcfa07b608/id-preview-04e55bce--4e838ce8-347a-4ffe-aa26-a7a179fec44f.lovable.app-1782689532352.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/de2d90d8-54db-41a7-ac6a-e6fcfa07b608/id-preview-04e55bce--4e838ce8-347a-4ffe-aa26-a7a179fec44f.lovable.app-1782689532352.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      const error = (event as Event & { payload?: unknown }).payload ?? event;
      reportLovableError(error, { boundary: "vite_preload_error" });
      recoverStaleRouteAsset(error);
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
