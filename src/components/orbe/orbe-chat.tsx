import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Bell, Loader2, MessageSquarePlus, Mic, MicOff, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  orbeApagarConversa, orbeBriefingDiario, orbeCarregarConversa, orbeChat, orbeListarConversas,
  orbeMarcarLida, orbeNotificacoes, orbeTranscrever,
} from "@/lib/orbe.functions";

type Mensagem = { id?: string; role: string; content: string; tool_name?: string | null; criado_em?: string };

const ATALHOS = [
  "Resumo de hoje",
  "Pendências críticas",
  "Situação das turmas",
  "Riscos da meta ciclo 1",
  "Como preencher frequência?",
  "Como funciona a prestação de contas?",
  "O que falta na etapa atual?",
];

const BRIEFING_KEY = "orbe.briefing.ultimo_dia";

export function OrbeChat({
  open, onOpenChange, onThinkingChange, onRecordingChange,
  pendingPrompt, onPendingPromptConsumed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onThinkingChange?: (v: boolean) => void;
  onRecordingChange?: (v: boolean) => void;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
}) {
  const [aba, setAba] = useState<"chat" | "notif">("chat");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [briefing, setBriefing] = useState<any | null>(null);
  const [briefingVisivel, setBriefingVisivel] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const qc = useQueryClient();
  const listarConv = useServerFn(orbeListarConversas);
  const carregar = useServerFn(orbeCarregarConversa);
  const enviar = useServerFn(orbeChat);
  const apagar = useServerFn(orbeApagarConversa);
  const listarNotif = useServerFn(orbeNotificacoes);
  const marcarLida = useServerFn(orbeMarcarLida);
  const transcrever = useServerFn(orbeTranscrever);
  const briefingFn = useServerFn(orbeBriefingDiario);

  const convQ = useQuery({
    queryKey: ["orbe", "conversas"],
    enabled: open,
    queryFn: async () => await listarConv({ data: {} as never }),
  });

  const notifQ = useQuery({
    queryKey: ["orbe", "notif-lista"],
    enabled: open,
    queryFn: async () => await listarNotif({ data: { apenas_nao_lidas: false } }),
  });

  const enviarMut = useMutation({
    mutationFn: async (mensagem: string) =>
      await enviar({ data: { conversa_id: conversaId, mensagem } }),
    onMutate: (m) => {
      setMensagens((prev) => [...prev, { role: "user", content: m }]);
      onThinkingChange?.(true);
    },
    onSuccess: (r) => {
      setConversaId(r.conversa_id);
      setMensagens((prev) => [...prev, { role: "assistant", content: r.resposta }]);
      qc.invalidateQueries({ queryKey: ["orbe", "conversas"] });
      onThinkingChange?.(false);
    },
    onError: (e: any) => {
      setMensagens((prev) => [...prev, { role: "assistant", content: `Erro: ${e?.message ?? "falha desconhecida"}` }]);
      onThinkingChange?.(false);
    },
  });

  // Briefing diário: mostra 1x por dia ao abrir o painel.
  useEffect(() => {
    if (!open) return;
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const ultimo = window.localStorage.getItem(BRIEFING_KEY);
      if (ultimo === hoje) return;
      briefingFn({ data: {} as never })
        .then((b) => {
          setBriefing(b);
          setBriefingVisivel(true);
          window.localStorage.setItem(BRIEFING_KEY, hoje);
        })
        .catch(() => undefined);
    } catch { /* noop */ }
  }, [open, briefingFn]);

  // Propaga estado de gravação para o orbe flutuante.
  useEffect(() => {
    onRecordingChange?.(gravando);
  }, [gravando, onRecordingChange]);

  // Propaga transcrevendo como "thinking".
  useEffect(() => {
    if (transcrevendo) onThinkingChange?.(true);
    else if (!enviarMut.isPending) onThinkingChange?.(false);
  }, [transcrevendo, enviarMut.isPending, onThinkingChange]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens, enviarMut.isPending]);

  // Quando o painel abre com uma pergunta pré-preenchida (HelpPoint / página de Ajuda),
  // envia automaticamente ao Orbe.
  useEffect(() => {
    if (!open || !pendingPrompt) return;
    setInput("");
    setConversaId(null);
    setMensagens([]);
    enviarMut.mutate(pendingPrompt);
    onPendingPromptConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingPrompt]);

  async function iniciarGravacao() {
    if (gravando || transcrevendo) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Este navegador não suporta gravação de áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = mimeCandidates.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) ?? "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        setGravando(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 500) {
          toast.error("Gravação muito curta.");
          return;
        }
        setTranscrevendo(true);
        try {
          const buf = await blob.arrayBuffer();
          // btoa em chunks para evitar estouro de stack em áudios longos.
          let binary = "";
          const bytes = new Uint8Array(buf);
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
          }
          const b64 = window.btoa(binary);
          const ext = type.includes("mp4") ? "m4a" : "webm";
          const r = await transcrever({
            data: { audio_base64: b64, mime_type: type, filename: `gravacao.${ext}` },
          });
          const texto = (r.texto ?? "").trim();
          if (!texto) {
            toast.error("Não foi possível transcrever o áudio.");
          } else {
            setInput((prev) => (prev ? `${prev} ${texto}` : texto));
          }
        } catch (e: any) {
          toast.error(`Falha ao transcrever: ${e?.message ?? "erro desconhecido"}`);
        } finally {
          setTranscrevendo(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setGravando(true);
    } catch (e: any) {
      const nome = e?.name ?? "";
      if (nome === "NotAllowedError" || nome === "SecurityError") {
        toast.error("Permissão de microfone negada. Habilite nas configurações do navegador.");
      } else if (nome === "NotFoundError") {
        toast.error("Nenhum microfone encontrado.");
      } else {
        toast.error(`Não foi possível acessar o microfone: ${e?.message ?? nome}`);
      }
    }
  }

  function pararGravacao() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    } else {
      setGravando(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function abrirConversa(id: string) {
    setConversaId(id);
    setMensagens([]);
    try {
      const r = await carregar({ data: { conversa_id: id } });
      const msgs = (r.mensagens as any[]).filter((m) => m.role !== "tool");
      setMensagens(msgs.map((m) => ({ role: m.role, content: m.content })));
    } catch (e: any) {
      setMensagens([{ role: "assistant", content: `Falha ao carregar: ${e?.message}` }]);
    }
  }

  function novaConversa() {
    setConversaId(null);
    setMensagens([]);
    setInput("");
  }

  function submeter(texto?: string) {
    const t = (texto ?? input).trim();
    if (!t || enviarMut.isPending) return;
    setInput("");
    enviarMut.mutate(t);
  }

  const naoLidas = useMemo(
    () => (notifQ.data?.notificacoes ?? []).filter((n: any) => !n.lida).length,
    [notifQ.data],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Orbe — assistente do projeto
          </SheetTitle>
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => setAba("chat")}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md border",
                aba === "chat" ? "bg-primary text-primary-foreground border-primary" : "border-transparent text-muted-foreground",
              )}
            >
              Conversa
            </button>
            <button
              onClick={() => setAba("notif")}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md border flex items-center gap-1",
                aba === "notif" ? "bg-primary text-primary-foreground border-primary" : "border-transparent text-muted-foreground",
              )}
            >
              <Bell className="h-3 w-3" />
              Notificações
              {naoLidas > 0 && <Badge variant="secondary" className="ml-1 h-4 text-[10px]">{naoLidas}</Badge>}
            </button>
          </div>
        </SheetHeader>

        {aba === "chat" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Lista de conversas + nova */}
            <div className="px-4 py-2 border-b flex items-center gap-2 overflow-x-auto">
              <Button size="sm" variant="outline" onClick={novaConversa} className="shrink-0 h-7">
                <MessageSquarePlus className="h-3 w-3 mr-1" /> Nova
              </Button>
              {(convQ.data?.conversas ?? []).slice(0, 8).map((c: any) => (
                <div key={c.id} className="shrink-0 flex items-center">
                  <button
                    onClick={() => abrirConversa(c.id)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border truncate max-w-[140px]",
                      conversaId === c.id ? "bg-muted border-primary/40" : "border-border hover:bg-muted/60",
                    )}
                    title={c.titulo ?? "sem título"}
                  >
                    {c.titulo ?? "sem título"}
                  </button>
                  <button
                    onClick={async () => {
                      await apagar({ data: { conversa_id: c.id } });
                      if (conversaId === c.id) novaConversa();
                      qc.invalidateQueries({ queryKey: ["orbe", "conversas"] });
                    }}
                    className="ml-0.5 p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Apagar conversa"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Atalhos */}
            {mensagens.length === 0 && (
              <div className="px-4 py-3 border-b flex flex-wrap gap-2">
                {ATALHOS.map((a) => (
                  <button
                    key={a}
                    onClick={() => submeter(a)}
                    className="text-xs px-2 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10"
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}

            {/* Briefing diário */}
            {briefingVisivel && briefing && (
              <div className="px-4 py-3 border-b bg-primary/5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Bom dia — briefing de {briefing.data}</p>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>
                        <strong className="text-foreground">
                          {(briefing.pendencias_criticas ?? []).length}
                        </strong>{" "}
                        pendência(s) crítica(s) aberta(s).
                      </li>
                      <li>
                        <strong className="text-foreground">
                          {(briefing.prazos_hoje_amanha ?? []).length}
                        </strong>{" "}
                        prazo(s) hoje/amanhã.
                      </li>
                      <li>
                        <strong className="text-foreground">
                          {(briefing.turmas_divergentes ?? []).length}
                        </strong>{" "}
                        turma(s) com divergência de matrículas.
                      </li>
                      <li>
                        <strong className="text-foreground">
                          {briefing.notificacoes_nao_lidas ?? 0}
                        </strong>{" "}
                        notificação(ões) não lida(s).
                      </li>
                    </ul>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        onClick={() => {
                          setBriefingVisivel(false);
                          submeter("Analise a situação atual do projeto e priorize as 3 ações mais urgentes.");
                        }}
                      >
                        <Sparkles className="h-3 w-3 mr-1" /> Analisar com IA
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setBriefingVisivel(false)}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mensagens */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {mensagens.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Pergunte qualquer coisa sobre o projeto — turmas, matrículas, pendências, AVA, metas…
                </p>
              )}
              {mensagens.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm max-w-[90%]",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              ))}
              {enviarMut.isPending && (
                <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Orbe está pensando…
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3 flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={gravando ? "Gravando… fale agora" : transcrevendo ? "Transcrevendo áudio…" : "Fale com o Orbe…"}
                rows={2}
                className="resize-none text-sm"
                disabled={transcrevendo}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submeter();
                  }
                }}
              />
              <Button
                onClick={gravando ? pararGravacao : iniciarGravacao}
                disabled={transcrevendo || enviarMut.isPending}
                size="icon"
                variant={gravando ? "destructive" : "outline"}
                aria-label={gravando ? "Parar gravação" : "Gravar áudio"}
                title={gravando ? "Parar gravação" : "Gravar áudio"}
              >
                {transcrevendo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : gravando ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={() => submeter()}
                disabled={!input.trim() || enviarMut.isPending || gravando || transcrevendo}
                size="icon"
                aria-label="Enviar"
              >
                {enviarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-4 py-3">
            {(notifQ.data?.notificacoes ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Sem notificações.</p>
            )}
            <ul className="space-y-2">
              {(notifQ.data?.notificacoes ?? []).map((n: any) => (
                <li
                  key={n.id}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    n.lida ? "opacity-60" : "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={n.severidade === "critico" ? "destructive" : n.severidade === "aviso" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {n.severidade}
                        </Badge>
                        <span className="font-medium">{n.titulo}</span>
                      </div>
                      {n.corpo && <p className="text-xs text-muted-foreground mt-1">{n.corpo}</p>}
                      {n.link_rota && (
                        <a
                          href={n.link_rota}
                          className="text-xs text-primary underline mt-1 inline-block"
                          onClick={() => onOpenChange(false)}
                        >
                          Abrir
                        </a>
                      )}
                    </div>
                    {!n.lida && (
                      <button
                        onClick={async () => {
                          await marcarLida({ data: { id: n.id } });
                          notifQ.refetch();
                          qc.invalidateQueries({ queryKey: ["orbe", "notificacoes"] });
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        marcar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
