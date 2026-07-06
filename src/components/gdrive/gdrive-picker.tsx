import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight, File as FileIcon, Folder, Home, Loader2, Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  gdriveBreadcrumb, listGdrive, searchGdrive,
} from "@/lib/gdrive.functions";

export type GDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
  iconLink?: string | null;
  thumbnailLink?: string | null;
  parents?: string[] | null;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

export function GDrivePicker({
  open,
  onOpenChange,
  onPick,
  title = "Escolher do Google Drive",
  description = "Navegue pela pasta do Projeto ou busque por nome.",
  multi = false,
  filesOnly = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (files: GDriveFile[]) => void;
  title?: string;
  description?: string;
  multi?: boolean;
  filesOnly?: boolean;
}) {
  const list = useServerFn(listGdrive);
  const search = useServerFn(searchGdrive);
  const crumbFn = useServerFn(gdriveBreadcrumb);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<GDriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaLive, setBuscaLive] = useState("");
  const [selected, setSelected] = useState<Record<string, GDriveFile>>({});
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected({});
    setBusca("");
    setBuscaLive("");
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load(target: string | null) {
    setLoading(true);
    setErr(null);
    try {
      const res = await list({ data: { folderId: target } });
      setItems(res.files ?? []);
      setFolderId(res.folderId);
      setRootId(res.rootFolderId);
      const cr = await crumbFn({ data: { folderId: res.folderId } });
      setCrumbs(cr.crumbs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doSearch(q: string) {
    setLoading(true);
    setErr(null);
    try {
      const res = await search({ data: { q } });
      setItems(res.files ?? []);
      setCrumbs([{ id: "_search", name: `Busca: "${q}"` }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggle(f: GDriveFile) {
    if (f.mimeType === FOLDER_MIME) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[f.id]) delete next[f.id];
      else if (multi) next[f.id] = f;
      else return { [f.id]: f };
      return next;
    });
  }

  function confirmar() {
    const arr = Object.values(selected);
    if (arr.length === 0) {
      toast.error("Selecione ao menos um arquivo.");
      return;
    }
    onPick(arr);
  }

  const rows = useMemo(() => {
    if (!filesOnly) return items;
    // Mostra pastas + arquivos; navegação em pastas por duplo clique/entrar.
    return items;
  }, [items, filesOnly]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={buscaLive}
              onChange={(e) => setBuscaLive(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && buscaLive.trim().length >= 2) {
                  setBusca(buscaLive.trim());
                  void doSearch(buscaLive.trim());
                }
              }}
              className="pl-8"
              placeholder="Buscar por nome…"
            />
          </div>
          {busca ? (
            <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setBuscaLive(""); void load(rootId); }}>
              Limpar
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto text-xs text-muted-foreground">
          <button
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => void load(rootId)}
          >
            <Home className="h-3 w-3" /> Raiz
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id + i} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button
                className="hover:text-foreground truncate max-w-[160px]"
                onClick={() => c.id !== "_search" && void load(c.id)}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>

        <ScrollArea className="h-[360px] rounded-md border">
          {err ? (
            <div className="p-4 text-sm text-destructive">{err}</div>
          ) : loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Pasta vazia.</div>
          ) : (
            <ul className="divide-y">
              {rows.map((f) => {
                const isFolder = f.mimeType === FOLDER_MIME;
                const sel = !!selected[f.id];
                return (
                  <li
                    key={f.id}
                    className={
                      "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer " +
                      (sel ? "bg-primary/10" : "hover:bg-muted/50")
                    }
                    onClick={() => (isFolder ? void load(f.id) : toggle(f))}
                    onDoubleClick={() => isFolder && void load(f.id)}
                  >
                    {isFolder ? (
                      <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                    ) : (
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{f.name}</span>
                    {isFolder ? (
                      <Badge variant="secondary" className="text-[10px]">pasta</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {f.size ? `${(Number(f.size) / 1024).toFixed(0)} KB` : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {Object.keys(selected).length} selecionado(s)
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={Object.keys(selected).length === 0}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Usar arquivo{multi ? "s" : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}