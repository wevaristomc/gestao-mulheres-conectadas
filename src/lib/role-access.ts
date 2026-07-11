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
  | "whatsapp"
  | "base-conhecimento"
  | "drive"
  | "relacao-horas"
  | "financeiro-relacoes-horas"
  | "etapas"
  | "configuracoes";

const ALL: AppRole[] = [...APP_ROLES];

export const MODULE_ACCESS: Record<ModuleKey, AppRole[]> = {
  "visao-geral": ALL,
  pendencias: ALL,
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
  ],
  administrativo: ["coordenador_geral", "administrativo"],
  financeiro: ["coordenador_geral", "administrativo", "gestor_financeiro"],
  captacao: ["coordenador_geral", "administrativo", "gestor_financeiro"],
  relatorios: [
    "coordenador_geral",
    "administrativo",
    "coordenador_pedagogico",
    "gestor_financeiro",
  ],
  whatsapp: ["coordenador_geral", "administrativo", "coordenador_pedagogico"],
  "base-conhecimento": ALL,
  drive: ALL,
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
  etapas: ALL,
  configuracoes: ["coordenador_geral", "administrativo"],
};

export function canAccess(module: ModuleKey, role: AppRole | null): boolean {
  if (!role) return false;
  return MODULE_ACCESS[module].includes(role);
}