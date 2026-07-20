import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  listarLandingHeroConfigAdmin,
  salvarLandingHeroConfig,
} from "@/lib/landing-config.functions";

const LIMITE_VIDEO = 50 * 1024 * 1024;
const LIMITE_POSTER = 10 * 1024 * 1024;

function validarVideo(arquivo: File): void {
  if (arquivo.type !== "video/mp4") throw new Error("O vídeo deve ser um arquivo MP4.");
  if (arquivo.size > LIMITE_VIDEO) throw new Error("O vídeo deve ter no máximo 50 MB.");
}

function validarPoster(arquivo: File): void {
  if (!["image/jpeg", "image/png"].includes(arquivo.type)) {
    throw new Error("O poster deve ser uma imagem JPG ou PNG.");
  }
  if (arquivo.size > LIMITE_POSTER) throw new Error("O poster deve ter no máximo 10 MB.");
}

export function HeroVideoAdminCard() {
  const queryClient = useQueryClient();
  const queryKey = ["landing-config", "admin"];
  const configQ = useQuery({ queryKey, queryFn: () => listarLandingHeroConfigAdmin() });
  const config = configQ.data;
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [permitirSom, setPermitirSom] = useState(false);
  const [inputVersion, setInputVersion] = useState(0);

  useEffect(() => {
    if (config) setPermitirSom(config.heroVideoSom);
  }, [config]);

  const operacao = useMutation({
    mutationFn: (acao: () => Promise<void>) => acao(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["landing-publica", "hero-config"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const limparSelecao = () => {
    setVideo(null);
    setPoster(null);
    setInputVersion((atual) => atual + 1);
  };

  const salvar = () =>
    operacao.mutate(async () => {
      if (video) validarVideo(video);
      if (poster) validarPoster(poster);
      if (!video && !config?.heroVideoPath) throw new Error("Selecione um vídeo MP4.");

      const enviados: string[] = [];
      try {
        let videoPath = config?.heroVideoPath ?? null;
        let posterPath = config?.heroPosterPath ?? null;

        if (video) {
          videoPath = `hero/${crypto.randomUUID()}.mp4`;
          const { error } = await supabase.storage.from("landing").upload(videoPath, video, {
            contentType: "video/mp4",
            upsert: false,
          });
          if (error) throw new Error(`Falha no upload do vídeo: ${error.message}`);
          enviados.push(videoPath);
        }

        if (poster) {
          const extensao = poster.type === "image/png" ? "png" : "jpg";
          posterPath = `hero/${crypto.randomUUID()}.${extensao}`;
          const { error } = await supabase.storage.from("landing").upload(posterPath, poster, {
            contentType: poster.type,
            upsert: false,
          });
          if (error) throw new Error(`Falha no upload do poster: ${error.message}`);
          enviados.push(posterPath);
        }

        await salvarLandingHeroConfig({
          data: { heroVideoPath: videoPath, heroPosterPath: posterPath, heroVideoSom: permitirSom },
        });
        limparSelecao();
        toast.success("Vídeo de abertura atualizado.");
      } catch (error) {
        if (enviados.length) await supabase.storage.from("landing").remove(enviados);
        throw error;
      }
    });

  const remover = () => {
    if (!window.confirm("Remover o vídeo de abertura e o poster da landing?")) return;
    operacao.mutate(async () => {
      await salvarLandingHeroConfig({
        data: { heroVideoPath: null, heroPosterPath: null, heroVideoSom: false },
      });
      setPermitirSom(false);
      limparSelecao();
      toast.success("Vídeo de abertura removido. O hero voltou ao formato padrão.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="size-5" /> Vídeo de abertura
        </CardTitle>
        <CardDescription>
          Gerencie o vídeo vertical exibido no hero da landing. O vídeo sempre inicia sem som.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {configQ.isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : configQ.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(configQ.error as Error).message}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <div className="mx-auto w-full max-w-[16.875rem]">
              {config?.heroVideoUrl ? (
                <div className="aspect-[9/16] max-h-[30rem] overflow-hidden rounded-2xl bg-[#05244d]">
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    poster={config.heroPosterUrl ?? undefined}
                    className="size-full object-contain"
                    aria-label="Prévia do vídeo de abertura"
                  >
                    <source src={config.heroVideoUrl} type="video/mp4" />
                    Seu navegador não consegue reproduzir este vídeo.
                  </video>
                </div>
              ) : (
                <div className="grid aspect-[9/16] max-h-[30rem] place-items-center rounded-2xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  Nenhum vídeo configurado. A landing mantém o card de métricas no hero.
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="hero-video">Vídeo MP4</Label>
                <Input
                  key={`video-${inputVersion}`}
                  id="hero-video"
                  type="file"
                  accept="video/mp4,.mp4"
                  onChange={(event) => setVideo(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Formato vertical 9:16 · até 50 MB.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hero-poster">Imagem poster opcional</Label>
                <Input
                  key={`poster-${inputVersion}`}
                  id="hero-poster"
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  onChange={(event) => setPoster(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">JPG ou PNG · até 10 MB.</p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <Label htmlFor="hero-som">Permitir ativar som</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quando habilitado, a landing mostra um botão para a visitante ativar o áudio.
                  </p>
                </div>
                <Switch id="hero-som" checked={permitirSom} onCheckedChange={setPermitirSom} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={salvar} disabled={operacao.isPending}>
                  {operacao.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : video || poster ? (
                    <Upload className="mr-2 size-4" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  Salvar vídeo de abertura
                </Button>
                <Button
                  variant="destructive"
                  onClick={remover}
                  disabled={operacao.isPending || !config?.heroVideoPath}
                >
                  <Trash2 className="mr-2 size-4" /> Remover
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
