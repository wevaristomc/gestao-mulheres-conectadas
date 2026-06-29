import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

const PROJETO_ID = "d91d2e5a-3d0b-4539-915c-5db6c95dd302";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar · Painel Mulheres Conectadas" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [temAdmin, setTemAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) {
        navigate({ to: "/", replace: true });
      }
    });
    supabase.rpc("tem_admin", { _projeto_id: PROJETO_ID }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setTemAdmin(true); // fail-closed: esconde cadastro
      else setTemAdmin(!!data);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

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
          {temAdmin === false ? (
            <Tabs defaultValue="signup">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta admin</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="pt-4"><SignInForm /></TabsContent>
              <TabsContent value="signup" className="pt-4"><SignUpForm /></TabsContent>
            </Tabs>
          ) : (
            <SignInForm />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setErrorMsg(error.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : error.message);
      return;
    }
    navigate({ to: "/", replace: true });
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      {errorMsg ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" placeholder="nome@organizacao.org.br" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !email || !password}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando…</> : "Entrar"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (password.length < 8) return setErrorMsg("Senha deve ter pelo menos 8 caracteres.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { nome: nome.trim() },
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) { setLoading(false); return setErrorMsg(error.message); }
    if (!data.session) {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e2) { setLoading(false); return setErrorMsg(e2.message); }
    }
    setLoading(false);
    navigate({ to: "/", replace: true });
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>Este projeto ainda não tem coordenação geral. O primeiro cadastro recebe o papel <strong>Coordenação Geral</strong> automaticamente.</span>
      </div>
      {errorMsg ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="s-nome">Nome completo</Label>
        <Input id="s-nome" value={nome} onChange={(e) => setNome(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-email">E-mail</Label>
        <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-password">Senha (mín. 8)</Label>
        <Input id="s-password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !email || !password || !nome}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando conta…</> : "Criar conta admin"}
      </Button>
    </form>
  );
}