import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha · Painel Mulheres Conectadas" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr("A senha deve ter pelo menos 8 caracteres.");
    if (password !== conf) return setErr("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setLoading(false);
    if (error) return setErr(error.message);
    setOk(true);
    setTimeout(() => navigate({ to: "/", replace: true }), 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Redefinir senha</CardTitle>
          <p className="text-sm text-muted-foreground">
            Escolha uma nova senha para acessar o painel.
          </p>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando link…
            </div>
          ) : ok ? (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-primary" />
              <span>Senha alterada. Redirecionando…</span>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={onSubmit}>
              {err ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                  <span>{err}</span>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="np">Nova senha</Label>
                <Input id="np" type="password" minLength={8} value={password}
                  onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp">Confirmar nova senha</Label>
                <Input id="cp" type="password" minLength={8} value={conf}
                  onChange={(e) => setConf(e.target.value)} required disabled={loading} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…</> : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}