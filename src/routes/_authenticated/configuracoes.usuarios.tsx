import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, KeyRound, Trash2, AlertCircle, Copy, CheckCircle2, Search, X, Mail, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

import { useActiveContext } from "@/hooks/use-active-context";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/role-access";
import {
  atualizarPapel, criarUsuario, listarUsuariosProjeto, removerAcesso, resetarSenha,
  alterarStatusUsuario, convidarUsuario,
} from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/configuracoes/usuarios")({
  component: UsuariosPage,
});

type Usuario = {
  id: string;
  email: string;
  nome: string | null;
  role: string;
  ativo: boolean;
  last_sign_in_at: string | null;
};

function gerarSenha(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < arr.length; i += 1) s += chars[arr[i] % chars.length];
  return s;
}

function UsuariosPage() {
  const { projetoId, user, role, isLoadingRoles } = useActiveContext();
  const qc = useQueryClient();
  const listarFn = useServerFn(listarUsuariosProjeto);

  const isCoord = role === "coordenador_geral";

  const usuariosQuery = useQuery({
    queryKey: ["usuarios", projetoId],
    queryFn: () => listarFn({ data: { projetoId: projetoId! } }) as Promise<Usuario[]>,
    enabled: !!projetoId && isCoord,
    retry: 1,
  });

  const [criarOpen, setCriarOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroRole, setFiltroRole] = useState<string>("todos");

  const usuariosFiltrados = useMemo(() => {
    const lista = usuariosQuery.data ?? [];
    const termo = busca.trim().toLowerCase();
    return lista.filter((u) => {
      if (filtroRole !== "todos" && u.role !== filtroRole) return false;
      if (!termo) return true;
      return (
        (u.nome ?? "").toLowerCase().includes(termo) ||
        u.email.toLowerCase().includes(termo)
      );
    });
  }, [usuariosQuery.data, busca, filtroRole]);

  const totalUsuarios = usuariosQuery.data?.length ?? 0;
  const temFiltro = busca.trim().length > 0 || filtroRole !== "todos";

  if (isLoadingRoles) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando papéis do usuário…
        </CardContent>
      </Card>
    );
  }

  if (!isCoord) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          Apenas usuários com papel <strong className="mx-1">Coordenação Geral</strong> podem gerenciar acessos.
        </CardContent>
      </Card>
    );
  }

  if (!projetoId) {
    return (
      <Card><CardContent className="p-4 text-sm text-muted-foreground">Selecione um projeto ativo.</CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Gerencie quem tem acesso ao projeto e seus respectivos papéis.
        </p>
        <div className="flex gap-2">
          <ConviteUsuarioDialog projetoId={projetoId} />
          <Dialog open={criarOpen} onOpenChange={setCriarOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Novo usuário</Button>
            </DialogTrigger>
            <CriarUsuarioDialog projetoId={projetoId} onClose={() => setCriarOpen(false)} />
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-8 pr-8"
          />
          {busca ? (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <Select value={filtroRole} onValueChange={setFiltroRole}>
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder="Filtrar por papel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os papéis</SelectItem>
            {APP_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {temFiltro ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setBusca(""); setFiltroRole("todos"); }}
          >
            Limpar
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          {usuariosQuery.isLoading ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : usuariosQuery.error ? (
            <div className="flex items-start gap-2 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" /> {(usuariosQuery.error as Error).message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="w-1 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totalUsuarios === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum usuário cadastrado neste projeto.
                    </TableCell>
                  </TableRow>
                ) : usuariosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum usuário encontrado com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  usuariosFiltrados.map((u) => (
                    <UsuarioLinha
                      key={u.id}
                      usuario={u}
                      projetoId={projetoId}
                      currentUserId={user?.id}
                      onChanged={() => qc.invalidateQueries({ queryKey: ["usuarios", projetoId] })}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalUsuarios > 0 ? (
        <p className="text-xs text-muted-foreground">
          Exibindo {usuariosFiltrados.length} de {totalUsuarios} usuário{totalUsuarios === 1 ? "" : "s"}.
        </p>
      ) : null}
    </div>
  );
}

function UsuarioLinha({
  usuario, projetoId, currentUserId, onChanged,
}: {
  usuario: Usuario;
  projetoId: string;
  currentUserId: string | undefined;
  onChanged: () => void;
}) {
  const atualizarFn = useServerFn(atualizarPapel);
  const removerFn = useServerFn(removerAcesso);
  const resetarFn = useServerFn(resetarSenha);
  const statusFn = useServerFn(alterarStatusUsuario);

  const [confirmRemover, setConfirmRemover] = useState(false);
  const [novaSenhaOpen, setNovaSenhaOpen] = useState<string | null>(null);

  const atualizar = useMutation({
    mutationFn: (role: AppRole) => atualizarFn({ data: { projetoId, userId: usuario.id, role } }),
    onSuccess: () => { toast.success("Papel atualizado."); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: () => removerFn({ data: { projetoId, userId: usuario.id } }),
    onSuccess: () => { toast.success("Acesso removido."); onChanged(); setConfirmRemover(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetar = useMutation({
    mutationFn: () => {
      const senha = gerarSenha();
      return resetarFn({ data: { projetoId, userId: usuario.id, novaSenha: senha } }).then(() => senha);
    },
    onSuccess: (senha) => { setNovaSenhaOpen(senha); toast.success("Senha redefinida."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const alterarStatus = useMutation({
    mutationFn: (ativo: boolean) =>
      statusFn({ data: { projetoId, userId: usuario.id, ativo } }),
    onSuccess: () => { toast.success("Status atualizado."); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isSelf = currentUserId === usuario.id;

  return (
    <TableRow>
      <TableCell className="font-medium">
        {usuario.nome ?? <span className="text-muted-foreground">—</span>}
        {isSelf ? <Badge variant="secondary" className="ml-2 text-[10px]">você</Badge> : null}
      </TableCell>
      <TableCell className="text-muted-foreground">{usuario.email}</TableCell>
      <TableCell>
        <Select
          value={usuario.role}
          onValueChange={(v) => atualizar.mutate(v as AppRole)}
          disabled={atualizar.isPending || isSelf || !usuario.ativo}
        >
          <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {APP_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={usuario.ativo}
            disabled={isSelf || alterarStatus.isPending}
            onCheckedChange={(v) => alterarStatus.mutate(v)}
          />
          {!usuario.ativo ? <Badge variant="outline" className="text-[10px]">inativo</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {usuario.last_sign_in_at
          ? new Date(usuario.last_sign_in_at).toLocaleString("pt-BR")
          : "Nunca"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => resetar.mutate()}
            disabled={resetar.isPending}
            title="Gerar nova senha provisória"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setConfirmRemover(true)}
            disabled={isSelf}
            title="Remover acesso ao projeto"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <AlertDialog open={confirmRemover} onOpenChange={setConfirmRemover}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover acesso</AlertDialogTitle>
              <AlertDialogDescription>
                {usuario.email} perderá acesso a este projeto. A conta de login não é apagada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => remover.mutate()} disabled={remover.isPending}>
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!novaSenhaOpen} onOpenChange={(o) => !o && setNovaSenhaOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova senha provisória</DialogTitle>
              <DialogDescription>
                Envie esta senha ao usuário por canal seguro. Ele deverá trocá-la no próximo login.
              </DialogDescription>
            </DialogHeader>
            <SenhaProvisoriaBox senha={novaSenhaOpen ?? ""} />
            <DialogFooter>
              <Button onClick={() => setNovaSenhaOpen(null)}>Concluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function CriarUsuarioDialog({ projetoId, onClose }: { projetoId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const criarFn = useServerFn(criarUsuario);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [roleSel, setRoleSel] = useState<AppRole>("administrativo");
  const [senha, setSenha] = useState(() => gerarSenha());
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null);

  const criar = useMutation({
    mutationFn: () => criarFn({ data: { projetoId, email: email.trim(), nome: nome.trim(), role: roleSel, senhaProvisoria: senha } }),
    onSuccess: () => {
      setCriada({ email: email.trim(), senha });
      qc.invalidateQueries({ queryKey: ["usuarios", projetoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formValido = useMemo(
    () => /.+@.+\..+/.test(email) && nome.trim().length >= 2 && senha.length >= 8,
    [email, nome, senha],
  );

  if (criada) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Usuário criado
          </DialogTitle>
          <DialogDescription>
            Envie estas credenciais ao usuário por canal seguro. Ele deverá trocar a senha no primeiro login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">E-mail</Label>
            <Input readOnly value={criada.email} />
          </div>
          <div>
            <Label className="text-xs">Senha provisória</Label>
            <SenhaProvisoriaBox senha={criada.senha} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo usuário</DialogTitle>
        <DialogDescription>
          Cria a conta no Supabase Auth e atribui um papel neste projeto.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="u-nome">Nome completo</Label>
          <Input id="u-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria da Silva" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-email">E-mail</Label>
          <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@organizacao.org.br" />
        </div>
        <div className="space-y-1.5">
          <Label>Papel no projeto</Label>
          <Select value={roleSel} onValueChange={(v) => setRoleSel(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {APP_ROLES.map((r) => (<SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-senha">Senha provisória</Label>
          <div className="flex gap-2">
            <Input id="u-senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="font-mono" />
            <Button type="button" variant="outline" onClick={() => setSenha(gerarSenha())}>Gerar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Mínimo 8 caracteres. Usuário trocará no primeiro acesso.</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => criar.mutate()} disabled={!formValido || criar.isPending}>
          {criar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Criar usuário
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SenhaProvisoriaBox({ senha }: { senha: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={senha} className="font-mono" />
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(senha);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function ConviteUsuarioDialog({ projetoId }: { projetoId: string }) {
  const qc = useQueryClient();
  const convidarFn = useServerFn(convidarUsuario);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [roleSel, setRoleSel] = useState<AppRole>("administrativo");

  const convidar = useMutation({
    mutationFn: () =>
      convidarFn({ data: { projetoId, email: email.trim(), nome: nome.trim(), role: roleSel } }),
    onSuccess: () => {
      toast.success("Convite enviado por e-mail.");
      qc.invalidateQueries({ queryKey: ["usuarios", projetoId] });
      setOpen(false);
      setEmail(""); setNome("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valido = /.+@.+\..+/.test(email) && nome.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Mail className="mr-1.5 h-4 w-4" /> Convidar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar por e-mail</DialogTitle>
          <DialogDescription>
            O usuário receberá um e-mail com link para definir a própria senha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-nome">Nome completo</Label>
            <Input id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-email">E-mail</Label>
            <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Papel no projeto</Label>
            <Select value={roleSel} onValueChange={(v) => setRoleSel(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {APP_ROLES.map((r) => (<SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => convidar.mutate()} disabled={!valido || convidar.isPending}>
            {convidar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}