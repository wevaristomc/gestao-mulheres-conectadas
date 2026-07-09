import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Bell, Loader2, MessageSquarePlus, Send, Sparkles, Trash2 } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  orbeApagarConversa, orbeCarregarConversa, orbeChat, orbeListarConversas,
  orbeMarcarLida, orbeNotificacoes,
} from "@/lib/orbe.functions";

type Mensagem = { id?: string; role: string; content: string; tool_name?: string | null; criado_em?: string };

const ATALHOS = [
  "Resumo de hoje",
  "Pendências críticas",
  "Situação das turmas",
  "Riscos da meta ciclo 1",
];

export function OrbeChat({
  open, onOpenChange, onThinkingChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onThinkingChange?: (v: boolean) => void;
}) {
  const [aba, setAba] = useState<"chat" | "notif">("chat");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const qc = useQueryClient();
  const listarConv = useServerFn(orbeListarConversas);
  const carregar = useServerFn(orbeCarregarConversa);
  const enviar = useServerFn(orbeChat);
  const apagar = useServerFn(orbeApagarConversa);
  const listarNotif = useServerFn(orbeNotificacoes);
  const marcarLida = useServerFn(orbeMarcarLida);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens, enviarMut.isPending]);

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
                placeholder="Fale com o Orbe…"
                rows={2}
                className="resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submeter();
                  }
                }}
              />
              <Button
                onClick={() => submeter()}
                disabled={!input.trim() || enviarMut.isPending}
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
