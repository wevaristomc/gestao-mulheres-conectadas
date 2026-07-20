import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { DepoimentoCard } from "@/components/landing/depoimento-card";
import { HeroVideoAdminCard } from "@/components/landing/hero-video-admin-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useHasRole } from "@/hooks/use-active-context";
import { supabase } from "@/integrations/supabase/client";
import {
  alternarLandingDepoimento,
  atualizarLandingDepoimento,
  criarLandingDepoimento,
  excluirLandingDepoimento,
  listarLandingDepoimentosAdmin,
  prepararUploadLandingDepoimento,
  removerLandingDepoimentoUpload,
  reordenarLandingDepoimentos,
  type LandingDepoimento,
} from "@/lib/landing-depoimentos.functions";

export const Route = createFileRoute("/_authenticated/administrativo/depoimentos")({
  component: DepoimentosLandingPage,
});

const PAPEIS_GESTAO = ["coordenador_geral", "coordenador_pedagogico", "administrativo"] as const;
const LIMITE_VIDEO = 50 * 1024 * 1024;

function validarVideo(arquivo: File): void {
  if (arquivo.type !== "video/mp4") throw new Error("O arquivo deve ser um vídeo MP4.");
  if (arquivo.size > LIMITE_VIDEO) throw new Error("O vídeo deve ter no máximo 50 MB.");
}

function DepoimentosLandingPage() {
  const { hasAnyRole } = useHasRole();
  const podeGerenciar = hasAnyRole([...PAPEIS_GESTAO]);
  const queryClient = useQueryClient();
  const queryKey = ["landing-depoimentos", "admin"];
  const depoimentosQ = useQuery({
    queryKey,
    queryFn: () => listarLandingDepoimentosAdmin(),
    enabled: podeGerenciar,
  });
  const depoimentos = depoimentosQ.data ?? [];
  const [dialogAberto, setDialogAberto] = useState(false);
  const [edicao, setEdicao] = useState<LandingDepoimento | null>(null);
  const [nome, setNome] = useState("");
  const [contexto, setContexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const operacao = useMutation({
    mutationFn: (acao: () => Promise<void>) => acao(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["landing-publica", "depoimentos"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const abrirNovo = () => {
    setEdicao(null);
    setNome("");
    setContexto("");
    setArquivo(null);
    setDialogAberto(true);
  };

  const abrirEdicao = (depoimento: LandingDepoimento) => {
    setEdicao(depoimento);
    setNome(depoimento.nome);
    setContexto(depoimento.contexto);
    setArquivo(null);
    setDialogAberto(true);
  };

  const enviarVideo = async (file: File): Promise<string> => {
    validarVideo(file);
    const upload = await prepararUploadLandingDepoimento();
    const { error } = await supabase.storage
      .from("landing")
      .uploadToSignedUrl(upload.path, upload.token, file, { contentType: "video/mp4" });
    if (error) {
      await removerLandingDepoimentoUpload({ data: { path: upload.path } });
      throw new Error(`Falha no upload: ${error.message}`);
    }
    return upload.path;
  };

  const salvar = () =>
    operacao.mutate(async () => {
      let novoVideoPath: string | null = null;
      try {
        if (arquivo) novoVideoPath = await enviarVideo(arquivo);
        if (edicao) {
          await atualizarLandingDepoimento({
            data: { id: edicao.id, nome, contexto, videoPath: novoVideoPath ?? undefined },
          });
          toast.success(
            novoVideoPath ? "Depoimento e vídeo atualizados." : "Depoimento atualizado.",
          );
        } else {
          if (!novoVideoPath) throw new Error("Selecione um vídeo MP4.");
          await criarLandingDepoimento({ data: { nome, contexto, videoPath: novoVideoPath } });
          toast.success("Depoimento adicionado à landing.");
        }
        setArquivo(null);
        setDialogAberto(false);
      } catch (error) {
        if (novoVideoPath) await removerLandingDepoimentoUpload({ data: { path: novoVideoPath } });
        throw error;
      }
    });

  const mover = (indice: number, direcao: -1 | 1) => {
    const destino = indice + direcao;
    if (destino < 0 || destino >= depoimentos.length) return;
    const ids = depoimentos.map((item) => item.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    operacao.mutate(async () => {
      await reordenarLandingDepoimentos({ data: { ids } });
      toast.success("Ordem atualizada.");
    });
  };

  if (!podeGerenciar) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Seu perfil não possui permissão para gerenciar a landing.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <HeroVideoAdminCard />

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Depoimentos</CardTitle>
            <CardDescription className="mt-1">
              Troque vídeos, textos e ordem sem alterar o código do site público.
            </CardDescription>
          </div>
          <Button onClick={abrirNovo}>
            <Plus className="mr-2 size-4" /> Adicionar depoimento
          </Button>
        </CardHeader>
        <CardContent>
          {depoimentosQ.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, indice) => (
                <Skeleton key={indice} className="h-80" />
              ))}
            </div>
          ) : depoimentosQ.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(depoimentosQ.error as Error).message}
            </div>
          ) : depoimentos.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {depoimentos.map((depoimento, indice) => (
                <Card key={depoimento.id} className={depoimento.ativo ? "" : "opacity-65"}>
                  <CardContent className="space-y-4 p-4">
                    <DepoimentoCard
                      nome={depoimento.nome}
                      contexto={depoimento.contexto}
                      videoUrl={depoimento.videoUrl}
                      variante="admin"
                    />
                    <div className="flex items-center justify-between rounded-md border p-2">
                      <Label htmlFor={`ativo-${depoimento.id}`}>Visível na landing</Label>
                      <Switch
                        id={`ativo-${depoimento.id}`}
                        checked={depoimento.ativo}
                        disabled={operacao.isPending}
                        onCheckedChange={(ativo) =>
                          operacao.mutate(async () => {
                            await alternarLandingDepoimento({ data: { id: depoimento.id, ativo } });
                            toast.success(ativo ? "Depoimento ativado." : "Depoimento ocultado.");
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        title="Mover para cima"
                        disabled={indice === 0 || operacao.isPending}
                        onClick={() => mover(indice, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Mover para baixo"
                        disabled={indice === depoimentos.length - 1 || operacao.isPending}
                        onClick={() => mover(indice, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => abrirEdicao(depoimento)}>
                        <Pencil className="mr-2 size-4" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={operacao.isPending}
                        onClick={() => {
                          if (!window.confirm(`Excluir o depoimento de ${depoimento.nome}?`))
                            return;
                          operacao.mutate(async () => {
                            await excluirLandingDepoimento({ data: { id: depoimento.id } });
                            toast.success("Depoimento excluído.");
                          });
                        }}
                      >
                        <Trash2 className="mr-2 size-4" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              Nenhum depoimento cadastrado. A landing usará os vídeos estáticos de segurança.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edicao ? "Editar depoimento" : "Adicionar depoimento"}</DialogTitle>
            <DialogDescription>
              {edicao
                ? "Atualize o nome e o contexto exibidos na landing."
                : "Envie um arquivo MP4 de até 50 MB."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="depoimento-nome">Nome</Label>
              <Input id="depoimento-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="depoimento-contexto">Contexto</Label>
              <Textarea
                id="depoimento-contexto"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                placeholder="Ex.: Aluna · Juatuba · Tarde"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="depoimento-video">
                {edicao ? "Trocar vídeo MP4 (opcional)" : "Vídeo MP4"}
              </Label>
              <Input
                id="depoimento-video"
                type="file"
                accept="video/mp4,.mp4"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {edicao
                  ? "Envie um novo arquivo apenas se quiser substituir o vídeo atual."
                  : "Limite: 50 MB."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={
                operacao.isPending || !nome.trim() || !contexto.trim() || (!edicao && !arquivo)
              }
            >
              {operacao.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : edicao ? (
                <Pencil className="mr-2 size-4" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
