import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/trocar-senha")({
  head: () => ({ meta: [{ title: "Trocar senha · Painel Mulheres Conectadas" }] }),
  component: TrocarSenhaPage,
});

function TrocarSenhaPage() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (senha.length < 8) return setErr("A senha deve ter pelo menos 8 caracteres.");
    if (senha !== conf) return setErr("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: senha,
      data: { must_change_password: false },
    });
    setLoading(false);
    if (error) return setErr(error.message);
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <Card>
        <CardHeader>
          <CardTitle>Definir nova senha</CardTitle>
          <p className="text-sm text-muted-foreground">
            Você está usando uma senha provisória. Defina uma nova senha para continuar.
          </p>
        </CardHeader>
        <CardContent>
          {err ? (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
              <span>{err}</span>
            </div>
          ) : null}
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Nova senha</Label>
              <Input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conf">Confirmar nova senha</Label>
              <Input id="conf" type="password" value={conf} onChange={(e) => setConf(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…</> : "Salvar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}