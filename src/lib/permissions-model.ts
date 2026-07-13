import { APP_ROLES, type AppRole, type ModuleKey } from "@/lib/role-access";

export type PermissionAction = "ver" | "criar" | "editar" | "excluir";

export type PermissionRow = {
  role: AppRole;
  modulo: ModuleKey;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
};

export const PERMISSION_MODULES: ModuleKey[] = [
  "visao-geral",
  "pendencias",
  "pedagogico",
  "mte",
  "administrativo",
  "financeiro",
  "captacao",
  "relatorios",
  "whatsapp",
  "base-conhecimento",
  "drive",
  "relacao-horas",
  "financeiro-relacoes-horas",
  "etapas",
  "ajuda",
  "configuracoes",
];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  "visao-geral": "Visão Geral",
  pendencias: "Pendências",
  pedagogico: "Pedagógico",
  mte: "Fiscalização MTE",
  administrativo: "Administrativo",
  financeiro: "Financeiro",
  captacao: "Captação",
  relatorios: "Relatórios",
  whatsapp: "WhatsApp",
  "base-conhecimento": "Base de Conhecimento",
  drive: "Drive do Projeto",
  "relacao-horas": "Relação de Horas",
  "financeiro-relacoes-horas": "Financeiro · Relações de Horas",
  etapas: "Etapas do Projeto",
  ajuda: "Ajuda",
  configuracoes: "Configurações",
};

const LEGACY_STORAGE_ROLE_BY_APP_ROLE: Record<AppRole, string> = {
  coordenador_geral: "admin",
  gestor_financeiro: "financeiro",
  administrativo: "captacao",
  coordenador_pedagogico: "coordenador",
  professor: "instrutor",
  auxiliar_pedagogico: "parceiro_mte",
};

const APP_ROLE_BY_STORAGE_ROLE: Record<string, AppRole> = {
  ...Object.fromEntries(APP_ROLES.map((role) => [role, role])),
  admin: "coordenador_geral",
  financeiro: "gestor_financeiro",
  captacao: "administrativo",
  coordenador: "coordenador_pedagogico",
  instrutor: "professor",
  parceiro_mte: "auxiliar_pedagogico",
};

export function isModuleKey(value: string): value is ModuleKey {
  return (PERMISSION_MODULES as readonly string[]).includes(value);
}

export function storageRoleForAppRole(role: AppRole, availableRoles: string[]): string {
  if (availableRoles.includes(role)) return role;
  const legacy = LEGACY_STORAGE_ROLE_BY_APP_ROLE[role];
  if (availableRoles.includes(legacy)) return legacy;
  return legacy;
}

function canonicalRoleFromStorage(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;
  return APP_ROLE_BY_STORAGE_ROLE[value] ?? null;
}

export function normalizePermissionRows(rows: Array<Record<string, unknown>>): PermissionRow[] {
  const byKey = new Map<string, PermissionRow & { _canonical: boolean }>();

  for (const raw of rows) {
    const role = canonicalRoleFromStorage(raw.role);
    const moduloRaw = typeof raw.modulo === "string" ? raw.modulo : "";
    if (!role || !isModuleKey(moduloRaw)) continue;

    const key = `${role}::${moduloRaw}`;
    const canonical = raw.role === role;
    const next = {
      role,
      modulo: moduloRaw,
      pode_ver: raw.pode_ver === true,
      pode_criar: raw.pode_criar === true,
      pode_editar: raw.pode_editar === true,
      pode_excluir: raw.pode_excluir === true,
      _canonical: canonical,
    };
    const current = byKey.get(key);
    if (!current || (!current._canonical && canonical)) byKey.set(key, next);
  }

  return Array.from(byKey.values())
    .map(({ _canonical, ...row }) => row)
    .sort((a, b) => {
      const roleDiff = APP_ROLES.indexOf(a.role) - APP_ROLES.indexOf(b.role);
      if (roleDiff !== 0) return roleDiff;
      return PERMISSION_MODULES.indexOf(a.modulo) - PERMISSION_MODULES.indexOf(b.modulo);
    });
}

export function emptyPermissionRow(role: AppRole, modulo: ModuleKey): PermissionRow {
  return {
    role,
    modulo,
    pode_ver: false,
    pode_criar: false,
    pode_editar: false,
    pode_excluir: false,
  };
}