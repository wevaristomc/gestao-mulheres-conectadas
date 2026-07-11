import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { OrbeChat } from "@/components/orbe/orbe-chat";
import { orbeNotificacoes, orbeVerificarAlertas } from "@/lib/orbe.functions";
import { supabase } from "@/integrations/supabase/client";
import { useActiveContext } from "@/hooks/use-active-context";

type Estado = "idle" | "thinking" | "alerta" | "recording";

// Canvas neural: ~40 pontos + sinapses por distância. Cor primária via CSS var.
function usePrimaryColor() {
  const [cor, setCor] = useState("hsl(240 80% 60%)");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    if (raw) setCor(raw.startsWith("hsl") ? raw : `hsl(${raw})`);
  }, []);
  return cor;
}

function NeuralCanvas({ estado }: { estado: Estado }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const cor = usePrimaryColor();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 64;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    if (prefersReduced) {
      // fallback estático: gradiente
      const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
      g.addColorStop(0, cor);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      return;
    }

    const N = 40;
    const raio = size / 2;
    type P = { x: number; y: number; vx: number; vy: number };
    const pts: P[] = Array.from({ length: N }, () => {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (raio - 4);
      return {
        x: size / 2 + Math.cos(ang) * r,
        y: size / 2 + Math.sin(ang) * r,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      };
    });

    let ativo = true;
    const onVis = () => { ativo = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);

    const draw = () => {
      if (!ativo) { rafRef.current = requestAnimationFrame(draw); return; }
      const speed = estado === "thinking" ? 2.0 : 1.0;
      const glow = estado === "thinking" ? 0.9 : 0.55;
      ctx.clearRect(0, 0, size, size);

      // halo âmbar se alerta
      if (estado === "alerta") {
        const t = (Date.now() % 1200) / 1200;
        const alpha = 0.35 + Math.sin(t * Math.PI * 2) * 0.2;
        ctx.fillStyle = `rgba(245, 158, 11, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, raio, 0, Math.PI * 2);
        ctx.fill();
      }
      // halo vermelho pulsante se gravando
      if (estado === "recording") {
        const t = (Date.now() % 900) / 900;
        const alpha = 0.35 + Math.sin(t * Math.PI * 2) * 0.25;
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, raio, 0, Math.PI * 2);
        ctx.fill();
      }

      // clip circular
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, raio - 1, 0, Math.PI * 2);
      ctx.clip();

      // sinapses
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy);
          if (d < 18) {
            const alpha = (1 - d / 18) * 0.5 * glow;
            ctx.strokeStyle = cor.replace(")", ` / ${alpha.toFixed(3)})`).replace("hsl(", "hsla(");
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      // neurônios
      for (const p of pts) {
        p.x += p.vx * speed;
        p.y += p.vy * speed;
        const dx = p.x - size / 2;
        const dy = p.y - size / 2;
        if (Math.hypot(dx, dy) > raio - 3) {
          p.vx = -p.vx; p.vy = -p.vy;
        }
        p.vx += (Math.random() - 0.5) * 0.05;
        p.vy += (Math.random() - 0.5) * 0.05;
        p.vx = Math.max(-0.6, Math.min(0.6, p.vx));
        p.vy = Math.max(-0.6, Math.min(0.6, p.vy));
        ctx.fillStyle = cor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, estado === "thinking" ? 1.6 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cor, estado]);

  return <canvas ref={ref} style={{ width: 64, height: 64 }} />;
}

const CHECK_KEY = "orbe.last_alert_check";
const THROTTLE_MS = 30 * 60 * 1000;

export function OrbeNeural() {
  const { user } = useActiveContext();
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const listar = useServerFn(orbeNotificacoes);
  const verificar = useServerFn(orbeVerificarAlertas);

  const notifQ = useQuery({
    queryKey: ["orbe", "notificacoes"],
    enabled: !!user,
    queryFn: async () => await listar({ data: { apenas_nao_lidas: true } }),
    refetchInterval: 60_000,
  });

  const naoLidas = (notifQ.data?.notificacoes ?? []).length;

  // Throttle: verifica alertas 1x/30min por usuário
  useEffect(() => {
    if (!user) return;
    try {
      const last = Number(window.localStorage.getItem(CHECK_KEY) ?? 0);
      if (Date.now() - last < THROTTLE_MS) return;
      window.localStorage.setItem(CHECK_KEY, String(Date.now()));
      verificar({ data: {} as never }).then(() => notifQ.refetch()).catch(() => undefined);
    } catch { /* noop */ }
  }, [user, verificar, notifQ]);

  // Realtime: escuta inserts em notificacoes
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("orbe-notif")
      .on("postgres_changes", { event: "*", schema: "public", table: "notificacoes" },
        () => { notifQ.refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, notifQ]);

  // Escuta evento global 'orbe:open' — HelpPoint e página /ajuda usam para
  // abrir o painel com uma pergunta pré-preenchida.
  useEffect(() => {
    function onOpen(ev: Event) {
      const detail = (ev as CustomEvent<{ pergunta?: string }>).detail;
      if (detail?.pergunta) setPendingPrompt(detail.pergunta);
      setOpen(true);
    }
    window.addEventListener("orbe:open", onOpen);
    return () => window.removeEventListener("orbe:open", onOpen);
  }, []);

  if (!user) return null;

  const estado: Estado = recording
    ? "recording"
    : thinking ? "thinking" : naoLidas > 0 ? "alerta" : "idle";

  return (
    <>
      <button
        type="button"
        aria-label="Abrir Orbe Neural"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center",
          "rounded-full bg-background/80 backdrop-blur shadow-lg border border-primary/30",
          "hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-primary",
        )}
      >
        <NeuralCanvas estado={estado} />
        <Sparkles className="absolute h-3 w-3 text-primary/70" style={{ opacity: 0 }} aria-hidden />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[11px] font-semibold flex items-center justify-center shadow">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>
      <OrbeChat
        open={open}
        onOpenChange={setOpen}
        onThinkingChange={setThinking}
        onRecordingChange={setRecording}
        pendingPrompt={pendingPrompt}
        onPendingPromptConsumed={() => setPendingPrompt(null)}
      />
    </>
  );
}
