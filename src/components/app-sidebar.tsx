import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  GraduationCap,
  ClipboardList,
  Wallet,
  Sprout,
  BarChart3,
  BookOpen,
  HardDrive,
  Settings,
  ShieldCheck,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { canAccess, type ModuleKey } from "@/lib/role-access";
import { useActiveContext } from "@/hooks/use-active-context";
import { Skeleton } from "@/components/ui/skeleton";

type Item = {
  key: ModuleKey;
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
};

const PRIMARY: Item[] = [
  { key: "visao-geral", title: "Visão Geral", url: "/", icon: LayoutDashboard },
  { key: "pendencias", title: "Pendências", url: "/pendencias", icon: ListChecks },
];

const MODULOS: Item[] = [
  { key: "pedagogico", title: "Pedagógico", url: "/pedagogico", icon: GraduationCap },
  { key: "mte", title: "Fiscalização MTE", url: "/mte", icon: ShieldCheck },
  { key: "administrativo", title: "Administrativo", url: "/administrativo", icon: ClipboardList },
  { key: "financeiro", title: "Financeiro", url: "/financeiro", icon: Wallet },
  { key: "captacao", title: "Captação", url: "/captacao", icon: Sprout },
  { key: "relatorios", title: "Relatórios", url: "/relatorios", icon: BarChart3 },
];

const APOIO: Item[] = [
  { key: "base-conhecimento", title: "Base de Conhecimento", url: "/base-conhecimento", icon: BookOpen },
  { key: "drive", title: "Drive do Projeto", url: "/drive", icon: HardDrive },
  { key: "configuracoes", title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { role, isLoadingRoles } = useActiveContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  const renderGroup = (label: string, items: Item[]) => {
    if (isLoadingRoles) {
      return (
        <SidebarGroup>
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="space-y-1 px-2 py-1">
              {items.map((i) => (
                <Skeleton key={i.key} className="h-7 w-full" />
              ))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }
    const visible = items.filter((i) => canAccess(i.key, role));
    if (visible.length === 0) return null;
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                  <Link to={item.url} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-semibold">
            MC
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">Mulheres Conectadas</span>
            <span className="text-xs text-sidebar-foreground/60">Painel administrativo</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Geral", PRIMARY)}
        {renderGroup("Módulos", MODULOS)}
        {renderGroup("Apoio", APOIO)}
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          Termo de Fomento · v0.1
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}