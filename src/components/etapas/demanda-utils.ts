import type { Atividade, Prioridade } from "@/lib/etapas-queries";
import { parseISODateLocal, formatarDataBR } from "@/lib/date-utils";

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const PRIORIDADE_COR: Record<Prioridade, string> = {
  baixa: "bg-slate-100 text-slate-700 border-slate-200",
  media: "bg-blue-100 text-blue-700 border-blue-200",
  alta: "bg-amber-100 text-amber-700 border-amber-200",
  critica: "bg-red-100 text-red-700 border-red-200",
};

// Cores por grupo — determinístico e simples.
const GRUPO_PALETA = [
  "bg-purple-100 text-purple-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
  "bg-indigo-100 text-indigo-700",
  "bg-cyan-100 text-cyan-700",
  "bg-rose-100 text-rose-700",
];

export function corDoGrupo(grupo: string): string {
  let h = 0;
  for (let i = 0; i < grupo.length; i++) h = (h * 31 + grupo.charCodeAt(i)) >>> 0;
  return GRUPO_PALETA[h % GRUPO_PALETA.length];
}

export function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isAtrasadaAtiv(a: Atividade): boolean {
  if (a.status === "concluida") return false;
  if (!a.prazo) return false;
  const p = parseISODateLocal(a.prazo);
  if (!p) return false;
  p.setHours(23, 59, 59);
  return p.getTime() < Date.now();
}

export function formatarPrazoCard(iso: string | null): string {
  return iso ? formatarDataBR(iso) : "Sem prazo";
}

export const KANBAN_COLUNAS = [
  { key: "pendente", label: "Pendente" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "bloqueada", label: "Bloqueada" },
  { key: "concluida", label: "Concluída" },
] as const;

export type KanbanColKey = (typeof KANBAN_COLUNAS)[number]["key"];