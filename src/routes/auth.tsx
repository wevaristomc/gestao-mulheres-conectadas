import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, CheckCircle2, Copy, Check, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
        <div className="px-6 pb-6">
          <SqlSetupDialog highlight={temAdmin === false} />
        </div>
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

const SETUP_SQL = `-- 1) Função pública para checar se o projeto já tem admin
create or replace function public.tem_admin(_projeto_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where projeto_id = _projeto_id and role = 'coordenador_geral'
  )
$$;
grant execute on function public.tem_admin(uuid) to anon, authenticated;

-- 2) Trigger: 1º usuário do projeto vira coordenador_geral automaticamente
create or replace function public.handle_first_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _projeto_id uuid := 'd91d2e5a-3d0b-4539-915c-5db6c95dd302'::uuid;
begin
  if not public.tem_admin(_projeto_id) then
    insert into public.user_roles(user_id, projeto_id, role)
    values (new.id, _projeto_id, 'coordenador_geral');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_first_admin on auth.users;
create trigger on_auth_user_created_first_admin
  after insert on auth.users
  for each row execute function public.handle_first_user();
`;

function SqlSetupDialog({ highlight }: { highlight: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(SETUP_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignora — usuário pode selecionar manualmente
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={highlight ? "secondary" : "ghost"}
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Database className="mr-2 h-3.5 w-3.5" />
        Primeiro acesso? Ver SQL de setup
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>SQL de setup do primeiro admin</DialogTitle>
            <DialogDescription>
              Execute este SQL uma única vez no Supabase para habilitar o cadastro
              automático do primeiro coordenador geral.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Passo 1 — Rode este SQL no Supabase</h3>
                <Button type="button" variant="outline" size="sm" onClick={copiar}>
                  {copied ? (
                    <><Check className="mr-1.5 h-3.5 w-3.5" /> Copiado!</>
                  ) : (
                    <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar SQL</>
                  )}
                </Button>
              </div>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                <code>{SETUP_SQL}</code>
              </pre>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">Passo 2 — Como executar</h3>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Abra o painel do Supabase → <strong>SQL Editor</strong> → <strong>New query</strong>.</li>
                <li>Cole o SQL acima e clique em <strong>Run</strong>.</li>
                <li>Espere ver <em>"Success. No rows returned"</em>.</li>
              </ol>
            </section>

            <section className="space-y-1.5">
              <h3 className="font-semibold">Passo 3 — Testar</h3>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Recarregue esta tela: a aba <strong>"Criar conta admin"</strong> deve aparecer.</li>
                <li>Cadastre nome + e-mail + senha (mín. 8). Você entra direto e recebe <code>coordenador_geral</code>.</li>
                <li>Confira no Supabase: <code className="rounded bg-muted px-1">select * from public.user_roles;</code> deve mostrar sua linha.</li>
                <li>A aba "Criar conta admin" some depois — novos usuários passam a ser criados em <strong>Configurações › Usuários</strong>.</li>
              </ol>
            </section>

            <section className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Opcional:</strong> para criar outros usuários pela tela
              Configurações › Usuários, também configure o secret <code>ADMIN_SERVICE_ROLE_KEY</code> no painel.
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}