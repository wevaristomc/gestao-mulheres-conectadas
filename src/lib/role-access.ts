export const APP_ROLES = [
  "coordenador_geral",
  "administrativo",
  "coordenador_pedagogico",
  "gestor_financeiro",
  "professor",
  "auxiliar_pedagogico",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_PRIORITY: readonly AppRole[] = APP_ROLES;

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

export type RoleScopeRow = {
  role: string;
  projeto_id?: string | null;
  ativo?: boolean | null;
};

export function resolveHighestRole(
  rows: RoleScopeRow[],
  projetoId: string | null,
): AppRole | null {
  const active = rows.filter((r) => r.ativo ?? true);
  const applicable = projetoId
    ? active.filter((r) => r.projeto_id === projetoId || r.projeto_id == null)
    : active;
  const pool = applicable.map((r) => r.role).filter(isAppRole);
  for (const role of ROLE_PRIORITY) {
    if (pool.includes(role)) return role;
  }
  return null;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  coordenador_geral: "Coordenação Geral",
  gestor_financeiro: "Gestão Financeira",
  administrativo: "Administrativo",
  coordenador_pedagogico: "Coordenação Pedagógica",
  professor: "Professor(a)",
  auxiliar_pedagogico: "Auxiliar Pedagógico",
};

export type ModuleKey =
  | "visao-geral"
  | "pendencias"
  | "pedagogico"
  | "mte"
  | "administrativo"
  | "financeiro"
  | "captacao"
  | "relatorios"
  | "whatsapp"
  | "base-conhecimento"
  | "drive"
  | "relacao-horas"
  | "financeiro-relacoes-horas"
  | "etapas"
  | "minhas-demandas"
  | "ajuda"
  | "configuracoes";

export const MODULE_ACCESS: Record<ModuleKey, AppRole[]> = {
  "visao-geral": [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
  ],
  pendencias: [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
  ],
  pedagogico: [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
    "professor",
    "auxiliar_pedagogico",
  ],
  mte: [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
    "professor",
    "auxiliar_pedagogico",
  ],
  administrativo: ["coordenador_geral", "administrativo", "gestor_financeiro"],
  financeiro: ["coordenador_geral", "administrativo", "gestor_financeiro"],
  captacao: ["coordenador_geral", "administrativo", "coordenador_pedagogico"],
  relatorios: [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
    "gestor_financeiro",
  ],
  whatsapp: ["coordenador_geral", "administrativo", "coordenador_pedagogico"],
  "base-conhecimento": [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
  ],
  drive: [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
  ],
  "relacao-horas": [
    "coordenador_geral",
    "administrativo",
    "professor",
    "auxiliar_pedagogico",
  ],
  "financeiro-relacoes-horas": [
    "coordenador_geral",
    "administrativo",
    "gestor_financeiro",
  ],
  etapas: [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
  ],
  "minhas-demandas": [...APP_ROLES],
  ajuda: [...APP_ROLES],
  configuracoes: ["coordenador_geral", "administrativo"],
};

export function canAccess(module: ModuleKey, role: AppRole | null): boolean {
  if (!role) return false;
  return MODULE_ACCESS[module].includes(role);
}

/**
 * Rota-destino padrão para cada papel quando o usuário tenta abrir uma
 * rota fora da matriz. Fail-closed: guarda de rota nunca deixa entrar.
 */
export function landingPathForRole(role: AppRole | null): string {
  switch (role) {
    case "professor":
    case "auxiliar_pedagogico":
      return "/pedagogico";
    case "gestor_financeiro":
      return "/financeiro";
    default:
      return "/";
  }
}