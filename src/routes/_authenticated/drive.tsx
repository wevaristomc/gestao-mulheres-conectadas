import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight, Download, ExternalLink, File as FileIcon, Folder, FolderPlus,
  FolderTree, Home, Loader2, RefreshCw, Search, Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useHasRole } from "@/hooks/use-active-context";
import {
  createGdriveFolder, ensureGdriveProjectStructure, gdriveBreadcrumb, listGdrive, searchGdrive,
  uploadToGdrive, verifyGdriveConnection,
} from "@/lib/gdrive.functions";

export const Route = createFileRoute("/_authenticated/drive")({
  head: () => ({ meta: [{ title: "Drive do Projeto · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("drive"),
  component: DrivePage,
});

const FOLDER_MIME = "application/vnd.google-apps.folder";

type GDriveFile = {
  id: string; name: string; mimeType: string; size?: string | null;
  modifiedTime?: string | null; webViewLink?: string | null;
};

function DrivePage() {
  const { hasAnyRole } = useHasRole();
  const canWrite = hasAnyRole(["coordenador_geral", "coordenador_pedagogico", "administrativo"]);
  const list = useServerFn(listGdrive);
  const search = useServerFn(searchGdrive);
  const crumbFn = useServerFn(gdriveBreadcrumb);
  const verify = useServerFn(verifyGdriveConnection);
  const mkdir = useServerFn(createGdriveFolder);
  const up = useServerFn(uploadToGdrive);
  const ensureStructure = useServerFn(ensureGdriveProjectStructure);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const [items, setItems] = useState<GDriveFile[]>([]);
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [buscaLive, setBuscaLive] = useState("");
  const [busca, setBusca] = useState("");

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [organizando, setOrganizando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void checkAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAndLoad() {
    setLoading(true);
    setErr(null);
    setWarn(null);
    try {
      const v = await verify();
      if (!v.ok) {
        setWarn(v.message ?? "Google Drive não configurado.");
      }
      await load(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

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

  async function criarPasta() {
    if (!newFolderName.trim()) return;
    try {
      await mkdir({ data: { name: newFolderName.trim(), parentId: folderId ?? undefined } });
      toast.success("Pasta criada");
      setNewFolderName("");
      setNewFolderOpen(false);
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar pasta");
    }
  }

  async function organizarPastas() {
    setOrganizando(true);
    try {
      const result = await ensureStructure();
      toast.success(
        result.created > 0
          ? `${result.created} pastas criadas; a estrutura documental está pronta.`
          : "A estrutura documental já estava organizada.",
      );
      await load(rootId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao organizar as pastas");
    } finally {
      setOrganizando(false);
    }
  }

  async function subirArquivo(file: File) {
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        bin += String.fromCharCode(...buf.subarray(i, Math.min(i + chunk, buf.length)));
      }
      const base64 = btoa(bin);
      await up({
        data: {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
          parentId: folderId ?? undefined,
        },
      });
      toast.success(`"${file.name}" enviado para o Drive`);
      await load(folderId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title="Drive do Projeto"
        description="Google Drive institucional do Projeto Mulheres Conectadas. Consulte, importe e envie arquivos para a conta compartilhada."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load(folderId)} disabled={loading}>
              <RefreshCw className={"mr-1.5 h-4 w-4 " + (loading ? "animate-spin" : "")} /> Atualizar
            </Button>
            {canWrite ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void organizarPastas()} disabled={organizando}>
                  {organizando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FolderTree className="mr-1.5 h-4 w-4" />}
                  Organizar pastas
                </Button>
                <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
                  <FolderPlus className="mr-1.5 h-4 w-4" /> Nova pasta
                </Button>
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                  Enviar arquivo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void subirArquivo(f);
                  }}
                />
              </>
            ) : null}
          </div>
        }
      />

      {warn ? (
        <Alert className="mb-4">
          <AlertTitle>Google Drive</AlertTitle>
          <AlertDescription>{warn}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-3 flex items-center gap-2">
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
            placeholder="Buscar arquivos por nome…"
          />
        </div>
        {busca ? (
          <Button size="sm" variant="ghost" onClick={() => { setBusca(""); setBuscaLive(""); void load(rootId); }}>
            Limpar
          </Button>
        ) : null}
      </div>

      <div className="mb-3 flex items-center gap-1 overflow-x-auto text-xs text-muted-foreground">
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
              className="hover:text-foreground truncate max-w-[220px]"
              onClick={() => c.id !== "_search" && void load(c.id)}
            >
              {c.name}
            </button>
          </span>
        ))}
      </div>

      <div className="rounded-md border bg-card">
        {err ? (
          <div className="p-4 text-sm text-destructive">{err}</div>
        ) : loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {busca ? "Nenhum resultado para a busca." : "Pasta vazia."}
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((f) => {
              const isFolder = f.mimeType === FOLDER_MIME;
              return (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                  {isFolder ? (
                    <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                  ) : (
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <button
                    className="flex-1 truncate text-left"
                    onClick={() => (isFolder ? void load(f.id) : window.open(f.webViewLink ?? "#", "_blank", "noopener,noreferrer"))}
                  >
                    {f.name}
                  </button>
                  {isFolder ? (
                    <Badge variant="secondary" className="text-[10px]">pasta</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {f.size ? `${(Number(f.size) / 1024).toFixed(0)} KB` : ""}
                    </span>
                  )}
                  {!isFolder && f.webViewLink ? (
                    <a
                      href={f.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:opacity-80"
                      title="Abrir no Drive"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova pasta no Drive</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Nome</Label>
            <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancelar</Button>
            <Button onClick={criarPasta} disabled={!newFolderName.trim()}>
              <FolderPlus className="mr-1.5 h-4 w-4" /> Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}