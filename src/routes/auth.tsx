import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar · Painel Mulheres Conectadas" }] }),
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold">
            MC
          </div>
          <CardTitle className="text-xl">Painel Mulheres Conectadas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Acesso restrito à equipe do projeto.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Autenticação aguardando a conexão da integração Supabase. Por enquanto,
              este formulário é apenas visual.
            </span>
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="nome@organizacao.org.br" autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline disabled:opacity-60"
                  disabled
                >
                  Esqueci minha senha
                </button>
              </div>
              <Input id="password" type="password" autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled>
              Entrar
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="text-primary hover:underline">
              Voltar ao painel
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}