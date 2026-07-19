import { useState } from "react";

import { cn } from "@/lib/utils";

type OrientacaoVideo = "vertical" | "horizontal";

type DepoimentoCardProps = {
  nome: string;
  contexto: string;
  videoUrl: string;
  variante?: "landing" | "admin";
};

export function DepoimentoCard({
  nome,
  contexto,
  videoUrl,
  variante = "landing",
}: DepoimentoCardProps) {
  const [orientacao, setOrientacao] = useState<OrientacaoVideo>("vertical");
  const vertical = orientacao === "vertical";

  return (
    <article
      className={cn(
        variante === "landing"
          ? "snap-start overflow-hidden rounded-[2rem] border border-[#05244d]/10 bg-[#05244d] text-white shadow-xl"
          : "w-full",
        variante === "landing" &&
          (vertical
            ? "min-w-[68vw] sm:min-w-[16rem] lg:min-w-[18rem]"
            : "min-w-[82vw] sm:min-w-[24rem] lg:min-w-[27rem]"),
        variante === "admin" && vertical && "mx-auto max-w-[18rem]",
      )}
      data-orientacao={orientacao}
    >
      <div
        className={cn(
          "w-full overflow-hidden bg-[#05244d]",
          vertical ? "aspect-[9/16] max-h-[32rem]" : "aspect-video",
        )}
      >
        <video
          controls
          playsInline
          preload="metadata"
          className="size-full bg-[#05244d] object-contain"
          aria-label={`Depoimento de ${nome}`}
          onLoadedMetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget;
            if (!videoWidth || !videoHeight) return;
            setOrientacao(videoWidth >= videoHeight ? "horizontal" : "vertical");
          }}
        >
          <source src={videoUrl} type="video/mp4" />
          Seu navegador não consegue reproduzir este vídeo.
        </video>
      </div>
      <div className={variante === "landing" ? "p-6" : "pt-4"}>
        <p className={variante === "landing" ? "font-display text-2xl font-bold" : "font-semibold"}>
          {nome}
        </p>
        <p
          className={cn(
            "mt-1 text-sm",
            variante === "landing" ? "text-white/65" : "text-muted-foreground",
          )}
        >
          {contexto}
        </p>
      </div>
    </article>
  );
}
