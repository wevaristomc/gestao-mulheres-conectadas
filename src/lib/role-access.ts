export const APP_ROLES = [
  "coordenador_geral",
  "gestor_financeiro",
  "administrativo",
  "coordenador_pedagogico",
  "professor",
  "auxiliar_pedagogico",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

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
  | "base-conhecimento"
  | "drive"
  | "configuracoes";

const ALL: AppRole[] = [...APP_ROLES];

export const MODULE_ACCESS: Record<ModuleKey, AppRole[]> = {
  "visao-geral": ALL,
  pendencias: ALL,
  pedagogico: [
    "coordenador_geral",
    "coordenador_pedagogico",
    "professor",
    "auxiliar_pedagogico",
  ],
  mte: [
    "coordenador_geral",
    "coordenador_pedagogico",
    "administrativo",
    "auxiliar_pedagogico",
  ],
  administrativo: ["coordenador_geral", "administrativo"],
  financeiro: ["coordenador_geral", "gestor_financeiro"],
  captacao: ["coordenador_geral", "gestor_financeiro"],
  relatorios: ["coordenador_geral", "coordenador_pedagogico", "gestor_financeiro"],
  "base-conhecimento": ALL,
  drive: ALL,
  configuracoes: ["coordenador_geral"],
};

export function canAccess(module: ModuleKey, role: AppRole | null): boolean {
  if (!role) return false;
  return MODULE_ACCESS[module].includes(role);
}