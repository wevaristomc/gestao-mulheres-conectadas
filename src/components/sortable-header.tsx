import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

export function SortableHeader<K extends string>({
  sort,
  sortKey,
  onSort,
  className,
  align = "left",
  children,
}: {
  sort: SortState<K>;
  sortKey: K;
  onSort: (key: K) => void;
  className?: string;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex w-full items-center gap-1 hover:text-foreground",
          align === "right" && "justify-end",
          align === "center" && "justify-center",
          !active && "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        <Icon className={cn("h-3 w-3", !active && "opacity-50")} />
      </button>
    </TableHead>
  );
}

export function compareStr(a: string | null | undefined, b: string | null | undefined, dir: SortDir) {
  const av = (a ?? "").trim();
  const bv = (b ?? "").trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  const r = av.localeCompare(bv, "pt-BR", { sensitivity: "base" });
  return dir === "asc" ? r : -r;
}

export function compareNum(a: number | null | undefined, b: number | null | undefined, dir: SortDir) {
  const an = typeof a === "number" && Number.isFinite(a);
  const bn = typeof b === "number" && Number.isFinite(b);
  if (!an && !bn) return 0;
  if (!an) return 1;
  if (!bn) return -1;
  const r = (a as number) - (b as number);
  return dir === "asc" ? r : -r;
}

export function compareBool(a: boolean, b: boolean, dir: SortDir) {
  const r = (a === b) ? 0 : a ? -1 : 1; // true first in asc
  return dir === "asc" ? r : -r;
}