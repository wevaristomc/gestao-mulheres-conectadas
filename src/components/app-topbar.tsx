import { Bell, ChevronDown, LogOut, User } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useActiveContext } from "@/hooks/use-active-context";
import { ROLE_LABELS } from "@/lib/role-access";
import { supabase } from "@/integrations/supabase/client";
import { pendenciasAbertasCountOptions } from "@/lib/dashboard-queries";

export function AppTopbar() {
  const { user, projetoNome, role, isBackendConnected } = useActiveContext();
  const navigate = useNavigate();
  const pendenciasQ = useQuery(pendenciasAbertasCountOptions());
  const pendenciasAbertas = (pendenciasQ.data as { value: number | null } | undefined)?.value ?? null;

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="text-foreground" />
      <Separator orientation="vertical" className="mx-1 h-6" />

      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-foreground">
          Painel Mulheres Conectadas
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {projetoNome ?? "Nenhum projeto ativo"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              aria-label="Notificações de pendências"
            >
              <Bell className="h-4 w-4" />
              {pendenciasAbertas !== null && pendenciasAbertas > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
                >
                  {pendenciasAbertas > 99 ? "99+" : pendenciasAbertas}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Pendências</div>
              {!isBackendConnected ? (
                <p className="text-xs text-muted-foreground">
                  Conecte o Supabase para carregar pendências.
                </p>
              ) : pendenciasQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Carregando…</p>
              ) : pendenciasAbertas === null ? (
                <p className="text-xs text-muted-foreground">
                  Sem acesso à tabela de pendências.
                </p>
              ) : pendenciasAbertas === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma pendência aberta.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {pendenciasAbertas} pendência{pendenciasAbertas === 1 ? "" : "s"} aguardando ação.
                </p>
              )}
              <Link
                to="/pendencias"
                className="inline-flex text-xs font-medium text-primary hover:underline"
              >
                Abrir lista completa →
              </Link>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden flex-col items-start leading-tight md:flex">
                <span className="text-xs font-medium text-foreground">
                  {user?.email ?? "Convidado"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {role ? ROLE_LABELS[role] : "Sem papel atribuído"}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {user?.email ?? "Sessão não iniciada"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!user}
              onSelect={(e) => {
                e.preventDefault();
                handleSignOut();
              }}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}