import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, Download, FileText, HardDrive, Loader2, Plus, Search, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { requireModuleAccess } from "@/lib/auth-guard";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  CATEGORIAS, categoriaLabel, documentosListOptions,
  formatBytes, formatarData, getSignedUrl, pickFirst, removeDocumentoFile, uploadDocumentoFile,
  type CategoriaKey, type DocRow,
} from "@/lib/base-conhecimento-queries";
import { GDrivePicker, type GDriveFile } from "@/components/gdrive/gdrive-picker";
import { registerUploadedDocumento, deleteDocumentoById } from "@/lib/base-conhecimento.functions";
import { importGdriveToBucket } from "@/lib/gdrive.functions";

export const Route = createFileRoute("/_authenticated/base-conhecimento")({
  head: () => ({ meta: [{ title: "Base de Conhecimento · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("base-conhecimento"),
  component: BaseConhecimentoPage,
});

function BaseConhecimentoPage() {
  const { projetoId } = useActiveContext();
  const qc = useQueryClient();
  const q = useQuery(documentosListOptions(projetoId));
  const rows = q.data?.rows ?? [];
  const erro = q.data?.error ?? (q.isError ? String(q.error) : null);

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<DocRow | null>(null);
  const [tab, setTab] = useState<"biblioteca" | "drive">("biblioteca");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importCat, setImportCat] = useState<CategoriaKey>("outros");
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const importGdrive = useServerFn(importGdriveToBucket);
  const deleteDocumento = useServerFn(deleteDocumentoById);

  const importFromDrive = useMutation({
    mutationFn: async (files: GDriveFile[]) => {
      if (!projetoId) throw new Error("Selecione um projeto ativo.");
      const toastId = "gdrive-import";
      const total = files.length;
      setImportProgress({ done: 0, total });
      toast.loading(`Importando 0 de ${total}…`, { id: toastId });
      const failed: { name: string; error: string }[] = [];
      let ok = 0;
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        try {
          await importGdrive({
            data: {
              fileId: f.id,
              bucket: "documentos",
              pathPrefix: projetoId,
              projetoId,
              categoria: importCat,
              registrarDocumento: true,
            },
          });
          ok += 1;
        } catch (e) {
          failed.push({ name: f.name, error: e instanceof Error ? e.message : String(e) });
        }
        const done = i + 1;
        setImportProgress({ done, total });
        toast.loading(`Importando ${done} de ${total}…`, { id: toastId });
      }
      return { ok, failed, toastId };
    },
    onSuccess: (r) => {
      const msg = r.failed.length === 0
        ? `${r.ok} documento(s) importado(s) do Drive`
        : `${r.ok} importado(s), ${r.failed.length} com falha`;
      if (r.failed.length === 0) toast.success(msg, { id: r.toastId });
      else {
        const detalhe = r.failed[0]
          ? `${r.failed[0].name}: ${r.failed[0].error}`
          : "Verifique os arquivos selecionados.";
        toast.error(`${msg}. ${detalhe}`, { id: r.toastId, duration: 9000 });
      }
      if (r.ok > 0) setPickerOpen(false);
      qc.invalidateQueries({ queryKey: ["base-conhecimento", "documentos", projetoId] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao importar", { id: "gdrive-import" }),
    onSettled: () => setImportProgress(null),
  });

  const filtered = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return rows.filter((r) => {
      const rowCategoria = String(pickFirst(r, ["categoria", "tipo"]) ?? "");
      if (categoria !== "todas" && rowCategoria !== categoria) return false;
      if (!s) return true;
      const hay = [
        pickFirst(r, ["titulo", "nome", "nome_arquivo", "storage_path"]),
        pickFirst(r, ["descricao", "observacao"]),
        rowCategoria,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return hay.includes(s);
    });
  }, [rows, busca, categoria]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = String(pickFirst(r, ["categoria", "tipo"]) ?? "outros");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const del = useMutation({
    mutationFn: (row: DocRow) => deleteDocumento({ data: { id: String(row.id) } }),
    onSuccess: () => {
      toast.success("Documento removido");
      qc.invalidateQueries({ queryKey: ["base-conhecimento", "documentos", projetoId] });
      setConfirmDel(null);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao remover"),
  });

  async function baixar(row: DocRow) {
    const path = row.storage_path ? String(row.storage_path) : null;
    if (!path) {
      toast.error("Arquivo sem caminho de armazenamento.");
      return;
    }
    try {
      const url = await getSignedUrl(path, 60);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar link");
    }
  }

  return (
    <div>
      <PageHeader
        title="Base de Conhecimento"
        description="Documentos do Termo de Fomento, modelos, normas e materiais de apoio do projeto."
        actions={
          <div className="flex gap-2">
            <Select value={importCat} onValueChange={(v) => setImportCat(v as CategoriaKey)}>
              <SelectTrigger className="h-9 w-[180px]" title="Categoria do import">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (<SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} disabled={!projetoId}>
              <HardDrive className="mr-1.5 h-4 w-4" /> Importar do Drive
            </Button>
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!projetoId}>
                <Plus className="mr-1.5 h-4 w-4" /> Novo documento
              </Button>
            </DialogTrigger>
            {projetoId ? (
              <UploadDialog
                projetoId={projetoId}
                onClose={() => setUploadOpen(false)}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["base-conhecimento", "documentos", projetoId] });
                  setUploadOpen(false);
                }}
              />
            ) : null}
          </Dialog>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total de documentos" value={String(rows.length)} loading={q.isLoading} erro={!!erro} />
        <Kpi
          label="Termo de Fomento"
          value={String(porCategoria.get("termo_fomento") ?? 0)}
          loading={q.isLoading}
          erro={!!erro}
        />
        <Kpi
          label="Modelos"
          value={String(porCategoria.get("modelos") ?? 0)}
          loading={q.isLoading}
          erro={!!erro}
        />
        <Kpi
          label="Normas"
          value={String(porCategoria.get("normas") ?? 0)}
          loading={q.isLoading}
          erro={!!erro}
        />
      </div>

      {erro ? (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Base de dados indisponível</div>
            <p className="mt-0.5 text-xs">{erro}</p>
            <p className="mt-1 text-xs">
              Configure a tabela <code>documentos</code> (id, projeto_id, titulo, descricao,
              categoria, storage_path, nome_arquivo, mime_type, tamanho_bytes, created_by,
              created_at) e o bucket privado <code>documentos</code> no Storage.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por título, descrição ou arquivo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Enviado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "Nenhum documento cadastrado neste projeto."
                    : "Nenhum documento corresponde ao filtro."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[420px]">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {String(pickFirst(r, ["titulo", "nome", "nome_arquivo", "storage_path"]) ?? "—")}
                        </div>
                        {pickFirst(r, ["descricao", "observacao", "drive_url"]) ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {String(pickFirst(r, ["descricao", "observacao", "drive_url"]))}
                          </div>
                        ) : pickFirst(r, ["nome_arquivo"]) && pickFirst(r, ["titulo"]) ? (
                          <div className="truncate text-xs text-muted-foreground">{String(pickFirst(r, ["nome_arquivo"]))}</div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{categoriaLabel(String(pickFirst(r, ["categoria", "tipo"]) ?? ""))}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatBytes(Number(r.tamanho_bytes ?? 0))}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatarData(pickFirst(r, ["created_at", "criado_em"]))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => baixar(r)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação exclui o registro e o arquivo do armazenamento. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDel && del.mutate(confirmDel)}
              disabled={del.isPending}
            >
              {del.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GDrivePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multi
        title="Importar do Google Drive"
        description={`Os arquivos selecionados serão baixados e salvos como categoria "${categoriaLabel(importCat)}".`}
        onPick={(files) => importFromDrive.mutate(files)}
        busy={importFromDrive.isPending}
        progress={importProgress}
      />
    </div>
  );
}

function Kpi({
  label, value, loading, erro, hint,
}: { label: string; value: string; loading?: boolean; erro?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className="mt-1 text-2xl font-semibold text-foreground">{erro ? "—" : value}</div>
      )}
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function UploadDialog({
  projetoId, onClose, onSaved,
}: { projetoId: string; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<CategoriaKey>("outros");
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const registerDocumento = useServerFn(registerUploadedDocumento);

  const up = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo.");
      if (!titulo.trim()) throw new Error("Informe um título.");
      let uploadedPath: string | null = null;
      try {
        const uploaded = await uploadDocumentoFile({ projeto_id: projetoId, file });
        uploadedPath = uploaded.path;
        return await registerDocumento({
          data: {
            projetoId,
            storagePath: uploaded.path,
            nomeArquivo: file.name,
            mimeType: file.type || null,
            tamanhoBytes: file.size,
            categoria,
            descricao: descricao.trim() || null,
            titulo: titulo.trim(),
          },
        });
      } catch (e) {
        if (uploadedPath) await removeDocumentoFile(uploadedPath);
        throw e;
      }
    },
    onSuccess: () => {
      toast.success("Documento enviado");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha no upload"),
  });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !titulo) setTitulo(f.name.replace(/\.[^.]+$/, ""));
  }

  return (
    <DialogContent className="max-h-[92svh] w-[calc(100vw-2rem)] max-w-[640px] overflow-y-auto p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle className="pr-8">Novo documento</DialogTitle>
        <DialogDescription className="pr-8">
          Envie um arquivo para a Base de Conhecimento do projeto.
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="bc-file">Arquivo</Label>
          <input
            ref={inputRef}
            id="bc-file"
            type="file"
            className="hidden"
            onChange={onPick}
          />
          <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> Selecionar arquivo
            </Button>
            <span className="min-w-0 break-words text-xs leading-relaxed text-muted-foreground sm:truncate">
              {file ? `${file.name} · ${formatBytes(file.size)}` : "Nenhum arquivo selecionado"}
            </span>
          </div>
        </div>

        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="bc-titulo">Título</Label>
          <Input id="bc-titulo" className="min-w-0" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>

        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="bc-categoria">Categoria</Label>
          <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaKey)}>
            <SelectTrigger id="bc-categoria" className="min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="bc-desc">Descrição (opcional)</Label>
          <Textarea
            id="bc-desc"
            className="min-w-0 resize-y"
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="ghost" onClick={onClose} disabled={up.isPending}>Cancelar</Button>
        <Button onClick={() => up.mutate()} disabled={up.isPending || !file}>
          {up.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
          Enviar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}