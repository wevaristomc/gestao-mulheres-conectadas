import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";

type HeroVideoProps = {
  videoUrl: string;
  posterUrl: string | null;
  permitirSom: boolean;
};

export function HeroVideo({ videoUrl, posterUrl, permitirSom }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduzirMovimento, setReduzirMovimento] = useState(true);
  const [reproducaoManual, setReproducaoManual] = useState(false);
  const [mudo, setMudo] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => setReduzirMovimento(media.matches);
    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduzirMovimento && !reproducaoManual) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    void video.play().catch(() => undefined);
  }, [reduzirMovimento, reproducaoManual]);

  useEffect(() => {
    if (!permitirSom) setMudo(true);
  }, [permitirSom]);

  const iniciarManualmente = () => {
    setReproducaoManual(true);
  };

  return (
    <div className="relative mx-auto w-full max-w-[19rem]">
      <div className="absolute -inset-4 rotate-3 rounded-[2.5rem] border border-[#f5b033]/45" />
      <div className="relative aspect-[9/16] max-h-[34rem] overflow-hidden rounded-[2.25rem] border border-white/15 bg-black shadow-2xl">
        <video
          ref={videoRef}
          autoPlay={!reduzirMovimento}
          muted={mudo}
          loop
          playsInline
          poster={posterUrl ?? undefined}
          preload="metadata"
          aria-label="Vídeo de abertura do projeto Mulheres Conectadas"
          className="size-full bg-[#05244d] object-contain"
        >
          <source src={videoUrl} type="video/mp4" />
          Seu navegador não consegue reproduzir o vídeo de abertura.
        </video>

        {reduzirMovimento && !reproducaoManual ? (
          <button
            type="button"
            onClick={iniciarManualmente}
            className="absolute inset-0 grid place-items-center bg-[#05244d]/35 transition hover:bg-[#05244d]/20 focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-white"
            aria-label="Reproduzir o vídeo de abertura"
          >
            <span className="grid size-16 place-items-center rounded-full bg-[#f5b033] text-[#05244d] shadow-xl">
              <Play className="ml-1 size-7" fill="currentColor" />
            </span>
          </button>
        ) : null}

        {permitirSom && (!reduzirMovimento || reproducaoManual) ? (
          <button
            type="button"
            onClick={() => setMudo((atual) => !atual)}
            className="absolute bottom-4 right-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#05244d]/85 px-4 text-xs font-bold text-white shadow-lg backdrop-blur transition hover:bg-[#05244d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={
              mudo ? "Ativar som do vídeo de abertura" : "Desativar som do vídeo de abertura"
            }
          >
            {mudo ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            {mudo ? "Ativar som" : "Desativar som"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
