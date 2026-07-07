import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { criarGrupo, processarZip } from "@/lib/whatsapp.functions";
import { gruposOptions, importacoesGrupoOptions } from "@/lib/whatsapp-queries";

export const Route = createFileRoute("/_authenticated/whatsapp/")({
  component: WhatsappIndex,
});

function WhatsappIndex() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gruposQ = useQuery(gruposOptions());
  const grupos = gruposQ.data?.rows ?? [];

  const [novoOpen, setNovoOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [obs, setObs] = useState("");

  const criarFn = useServerFn(criarGrupo);
  const criarMut = useMutation({
    mutationFn: async () => criarFn({ data: { nome, observacoes: obs || null } }),
    onSuccess: () => {
      toast.success("Grupo criado");
      setNovoOpen(false); setNome(""); setObs("");
      qc.invalidateQueries({ queryKey: ["wa", "grupos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [uploadGrupoId, setUploadGrupoId] = useState<string | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const processarFn = useServerFn(processarZip);
  const importMut = useMutation({
    mutationFn: async () => {
      if (!uploadGrupoId || !zipFile) throw new Error("Selecione um grupo e um arquivo .zip");
      const tempId = crypto.randomUUID();
      const storage_path = `imports/${tempId}/original.zip`;
      const up = await supabase.storage.from("whatsapp").upload(storage_path, zipFile, {
        upsert: true, contentType: "application/zip",
      });
      if (up.error) throw new Error(up.error.message);
      const res = await processarFn({
        data: {
          grupo_id: uploadGrupoId,
          storage_path,
          arquivo_nome: zipFile.name,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      toast.success(`Importação criada: ${res.total_mensagens} mensagens (${res.total_audios} áudios, ${res.total_imagens} imagens).`);
      setUploadGrupoId(null); setZipFile(null);
      qc.invalidateQueries({ queryKey: ["wa"] });
      navigate({ to: "/whatsapp/$importacaoId", params: { importacaoId: res.importacao_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="WhatsApp — grupos do projeto"
        description="Exporte a conversa pelo WhatsApp (com mídias) e envie o .zip aqui. Transcrevemos áudios, analisamos imagens, vinculamos telefones às alunas e geramos relatórios prévios."
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {grupos.length} grupo(s) cadastrado(s).
        </p>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Novo grupo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar grupo de WhatsApp</DialogTitle>
              <DialogDescription>Use o mesmo nome do grupo no WhatsApp para facilitar a identificação.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Nome do grupo *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Turma BH 2024/2 - Programador Web" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Observações</Label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNovoOpen(false)} disabled={criarMut.isPending}>Cancelar</Button>
              <Button onClick={() => criarMut.mutate()} disabled={!nome.trim() || criarMut.isPending}>
                {criarMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {grupos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum grupo ainda. Crie o primeiro grupo para começar a importar conversas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {grupos.map((g) => (
            <GrupoCard
              key={g.id}
              grupoId={g.id}
              nome={g.nome}
              observacoes={g.observacoes}
              onUpload={() => setUploadGrupoId(g.id)}
              uploadOpen={uploadGrupoId === g.id}
              setUploadOpen={(v) => setUploadGrupoId(v ? g.id : null)}
              zipFile={zipFile}
              setZipFile={setZipFile}
              onImport={() => importMut.mutate()}
              importing={importMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoCard(props: {
  grupoId: string;
  nome: string;
  observacoes: string | null;
  onUpload: () => void;
  uploadOpen: boolean;
  setUploadOpen: (v: boolean) => void;
  zipFile: File | null;
  setZipFile: (f: File | null) => void;
  onImport: () => void;
  importing: boolean;
}) {
  const impQ = useQuery(importacoesGrupoOptions(props.grupoId));
  const importacoes = impQ.data?.rows ?? [];
  const ultima = useMemo(() => importacoes[0], [importacoes]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="truncate">{props.nome}</span>
        </CardTitle>
        {props.observacoes ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{props.observacoes}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{importacoes.length} importação(ões)</Badge>
          {ultima ? <span>Última: {new Date(ultima.created_at ?? "").toLocaleDateString("pt-BR")}</span> : null}
        </div>

        <Dialog open={props.uploadOpen} onOpenChange={props.setUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary" className="w-full" onClick={props.onUpload}>
              <Upload className="mr-1.5 h-4 w-4" /> Enviar .zip do WhatsApp
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar exportação do WhatsApp</DialogTitle>
              <DialogDescription>
                No WhatsApp, abra o grupo → &quot;Exportar conversa&quot; → &quot;Incluir mídia&quot;. Envie o .zip resultante (até ~30 MB).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label className="text-xs">Arquivo .zip *</Label>
              <Input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => props.setZipFile(e.target.files?.[0] ?? null)}
              />
              {props.zipFile ? (
                <p className="text-xs text-muted-foreground">
                  {props.zipFile.name} · {(props.zipFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => props.setUploadOpen(false)} disabled={props.importing}>Cancelar</Button>
              <Button onClick={props.onImport} disabled={!props.zipFile || props.importing}>
                {props.importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Processar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {ultima ? (
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link to="/whatsapp/$importacaoId" params={{ importacaoId: ultima.id }}>Abrir última importação</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}