import { HelpCircle, Sparkles } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AJUDA } from "@/data/ajuda-conteudo";

/** Evento global que o Orbe (OrbeNeural) escuta para abrir com pergunta pré-preenchida. */
export const ORBE_OPEN_EVENT = "orbe:open";

export function abrirOrbeComPergunta(pergunta: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ORBE_OPEN_EVENT, { detail: { pergunta } }));
}

export type HelpPointProps = {
  /** Chave em `src/data/ajuda-conteudo.ts` (ex.: "beneficiaria.cpf"). */
  id: string;
  /** Sobrescreve o título exibido no popover. */
  titulo?: string;
  /** Classe extra do gatilho (ícone). */
  className?: string;
  /** Tamanho do ícone. */
  size?: number;
};

export function HelpPoint({ id, titulo, className, size = 14 }: HelpPointProps) {
  const entry = AJUDA[id];
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!entry) return null;

  const perguntaOrbe = `Estou em ${pathname}. Me explique como preencher: "${entry.titulo}".`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Ajuda: ${entry.titulo}`}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors",
            className,
          )}
        >
          <HelpCircle style={{ width: size, height: size }} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm">
        <div className="space-y-2">
          <div className="font-semibold text-foreground">{titulo ?? entry.titulo}</div>
          <p className="text-muted-foreground leading-snug">{entry.explicacao}</p>
          {entry.exemplo && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs">
              <div className="mb-0.5 font-medium text-foreground">Exemplo</div>
              <div className="text-muted-foreground">{entry.exemplo}</div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button asChild size="sm" variant="link" className="h-auto px-0 text-xs">
              <Link to={entry.rota_ajuda ?? "/ajuda"}>Saiba mais</Link>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1 text-xs"
              onClick={() => abrirOrbeComPergunta(perguntaOrbe)}
            >
              <Sparkles className="h-3 w-3" /> Perguntar ao Orbe
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
