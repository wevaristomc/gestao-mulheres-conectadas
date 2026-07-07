import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Save, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { salvarProvedor, testarProvedor, salvarPolitica } from "@/lib/ia.functions";
import { provedoresOptions, politicasOptions, consumoOptions } from "@/lib/ia-queries";

export const Route = createFileRoute("/_authenticated/configuracoes/ia")({
  component: ConfigIA,
});

type Provedor = {
  id: string;
  provedor: string;
  nome_exibicao?: string | null;
  base_url: string;
  ativo: boolean;
  prioridade: number;
  modelo_padrao: string | null;
  modelos_disponiveis: string[] | null;
  gratuito: boolean | null;
  tem_key: boolean;
  api_key_preview: string | null;
};

function ConfigIA() {
  const provQ = useQuery(provedoresOptions());
  const polQ = useQuery(politicasOptions());
  const consQ = useQuery(consumoOptions(14));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Provedores de IA (BYOK)
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Configure suas próprias API Keys. A cadência prioriza modelos gratuitos e cai
          para pagos apenas se o fallback for necessário. As chaves ficam no servidor —
          nunca são expostas ao navegador.
        </p>
        {provQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-48" /><Skeleton className="h-48" />
          </div>
        ) : provQ.isError ? (
          <ErroBox mensagem={String((provQ.error as Error)?.message ?? provQ.error)} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(provQ.data ?? []).map((p: any) => (
              <ProvedorCard key={p.id} p={p as Provedor} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4" /> Política de Cadência
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Cada processo escolhe seu provedor preferido. Tarefas simples (classificação)
          usam modelos gratuitos; tarefas complexas usam pagos. Economia de tokens.
        </p>
        {polQ.isLoading ? <Skeleton className="h-40" /> : polQ.isError ? (
          <ErroBox mensagem={String((polQ.error as Error)?.message ?? polQ.error)} />
        ) : (
          <PoliticasTabela politicas={(polQ.data ?? []) as any[]} provedores={(provQ.data ?? []) as Provedor[]} />
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">Consumo (últimos 14 dias)</h2>
        {consQ.isLoading ? <Skeleton className="h-32" /> : consQ.isError ? (
          <ErroBox mensagem={String((consQ.error as Error)?.message ?? consQ.error)} />
        ) : (
          <ConsumoTabela logs={(consQ.data ?? []) as any[]} />
        )}
      </section>
    </div>
  );
}

function ErroBox({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-xs">{mensagem}</div>
    </div>
  );
}

function ProvedorCard({ p }: { p: Provedor }) {
  const qc = useQueryClient();
  const [mostrar, setMostrar] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [modelo, setModelo] = useState(p.modelo_padrao ?? "");
  const [ativo, setAtivo] = useState(p.ativo);
  const [prioridade, setPrioridade] = useState(p.prioridade);

  const salvarMut = useMutation({
    mutationFn: async () => {
      const payload: any = { id: p.id, modelo_padrao: modelo || undefined, ativo, prioridade };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      return await salvarProvedor({ data: payload });
    },
    onSuccess: () => {
      toast.success("Provedor atualizado.");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["ia", "provedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testarMut = useMutation({
    mutationFn: async () => await testarProvedor({ data: { id: p.id } }),
    onSuccess: (r: any) => toast.success(`OK — resposta: "${r.resposta?.slice(0, 60) ?? ""}"`),
    onError: (e: Error) => toast.error(`Falhou: ${e.message}`),
  });

  const modelos = Array.isArray(p.modelos_disponiveis) ? p.modelos_disponiveis : [];
  const nome = p.nome_exibicao || p.provedor;

  return (
    <div className="rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{nome}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{p.provedor}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={p.gratuito ? "secondary" : "outline"} className="text-[10px]">
            {p.gratuito ? "GRATUITO" : "PAGO"}
          </Badge>
          {p.tem_key ? <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Configurado</Badge> : null}
        </div>
      </div>

      <div>
        <Label htmlFor={`k-${p.id}`} className="text-xs">API Key {p.tem_key ? <span className="text-muted-foreground font-mono">({p.api_key_preview})</span> : null}</Label>
        <div className="mt-1 flex gap-1.5">
          <Input
            id={`k-${p.id}`}
            type={mostrar ? "text" : "password"}
            placeholder={p.tem_key ? "Deixe em branco para manter" : "Cole sua chave"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button type="button" size="icon" variant="outline" onClick={() => setMostrar((v) => !v)}>
            {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Modelo padrão</Label>
          {modelos.length > 0 ? (
            <Select value={modelo} onValueChange={setModelo}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
              <SelectContent>
                {modelos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input className="mt-1" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="ex: gpt-4o-mini" />
          )}
        </div>
        <div>
          <Label className="text-xs">Prioridade</Label>
          <Input type="number" className="mt-1" value={prioridade} onChange={(e) => setPrioridade(Number(e.target.value))} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={ativo} onCheckedChange={setAtivo} /> Ativo
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => testarMut.mutate()} disabled={testarMut.isPending || !p.tem_key}>
            {testarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Testar"}
          </Button>
          <Button size="sm" onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>
            {salvarMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {(() => {
        if (testarMut.isPending || salvarMut.isPending) return null;
        if (testarMut.isError) {
          const msg = (testarMut.error as Error)?.message ?? String(testarMut.error);
          return (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="whitespace-pre-wrap break-words">
                <span className="font-medium">Falha no teste: </span>{msg.slice(0, 300)}
              </div>
            </div>
          );
        }
        if (testarMut.isSuccess && testarMut.data) {
          const r = testarMut.data as { resposta?: string; modelo?: string; tokens?: number };
          return (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="whitespace-pre-wrap break-words">
                <span className="font-medium">OK</span> — {r.modelo} · {r.tokens ?? 0} tokens
                {r.resposta ? <span className="text-muted-foreground"> · “{r.resposta.slice(0, 120)}”</span> : null}
              </div>
            </div>
          );
        }
        if (salvarMut.isError) {
          const msg = (salvarMut.error as Error)?.message ?? String(salvarMut.error);
          return (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="whitespace-pre-wrap break-words">
                <span className="font-medium">Falha ao salvar: </span>{msg.slice(0, 300)}
              </div>
            </div>
          );
        }
        if (salvarMut.isSuccess) {
          return (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Salvo
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}

function PoliticasTabela({ politicas, provedores }: { politicas: any[]; provedores: Provedor[] }) {
  const qc = useQueryClient();
  const [linhaEdit, setLinhaEdit] = useState<Record<string, any>>({});

  const salvarMut = useMutation({
    mutationFn: async (row: any) => await salvarPolitica({ data: row }),
    onSuccess: () => {
      toast.success("Política salva.");
      qc.invalidateQueries({ queryKey: ["ia", "politicas"] });
      setLinhaEdit({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Processo</TableHead>
            <TableHead>Provedor preferido</TableHead>
            <TableHead className="w-28">Max tokens</TableHead>
            <TableHead className="w-24">Temp.</TableHead>
            <TableHead className="w-28">Fallback</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {politicas.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Nenhuma política cadastrada.</TableCell></TableRow>
          ) : politicas.map((p: any) => {
            const edit = linhaEdit[p.id] ?? p;
            const dirty = JSON.stringify(edit) !== JSON.stringify(p);
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium text-sm">{p.processo}</div>
                  {p.descricao ? <div className="text-[11px] text-muted-foreground">{p.descricao}</div> : null}
                </TableCell>
                <TableCell>
                  <Select
                    value={edit.provedor_preferido ?? ""}
                    onValueChange={(v) => setLinhaEdit((m) => ({ ...m, [p.id]: { ...edit, provedor_preferido: v || null } }))}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="Auto" /></SelectTrigger>
                    <SelectContent>
                      {provedores.map((pv) => <SelectItem key={pv.id} value={pv.provedor}>{pv.nome_exibicao || pv.provedor}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input type="number" className="h-8" value={edit.max_tokens ?? ""} onChange={(e) => setLinhaEdit((m) => ({ ...m, [p.id]: { ...edit, max_tokens: Number(e.target.value) || null } }))} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.1" className="h-8" value={edit.temperatura ?? ""} onChange={(e) => setLinhaEdit((m) => ({ ...m, [p.id]: { ...edit, temperatura: Number(e.target.value) } }))} />
                </TableCell>
                <TableCell>
                  <Switch checked={edit.usar_fallback !== false} onCheckedChange={(v) => setLinhaEdit((m) => ({ ...m, [p.id]: { ...edit, usar_fallback: v } }))} />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled={!dirty || salvarMut.isPending} onClick={() => salvarMut.mutate({
                    id: p.id,
                    provedor_preferido: edit.provedor_preferido ?? null,
                    max_tokens: edit.max_tokens ?? undefined,
                    temperatura: edit.temperatura ?? undefined,
                    usar_fallback: edit.usar_fallback ?? undefined,
                  })}>Salvar</Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ConsumoTabela({ logs }: { logs: any[] }) {
  const agrup = useMemo(() => {
    const map = new Map<string, { provedor: string; chamadas: number; tokens: number; falhas: number }>();
    for (const l of logs) {
      const key = String(l.provedor);
      const cur = map.get(key) ?? { provedor: key, chamadas: 0, tokens: 0, falhas: 0 };
      cur.chamadas += 1;
      cur.tokens += (l.tokens_entrada ?? 0) + (l.tokens_saida ?? 0);
      if (!l.sucesso) cur.falhas += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.tokens - a.tokens);
  }, [logs]);

  if (agrup.length === 0) {
    return <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">Sem uso de IA registrado no período.</div>;
  }
  const maxTok = Math.max(...agrup.map((a) => a.tokens), 1);
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provedor</TableHead>
            <TableHead>Chamadas</TableHead>
            <TableHead>Falhas</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead className="w-64">Uso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agrup.map((a) => (
            <TableRow key={a.provedor}>
              <TableCell className="font-mono text-xs">{a.provedor}</TableCell>
              <TableCell>{a.chamadas}</TableCell>
              <TableCell className={a.falhas > 0 ? "text-destructive" : ""}>{a.falhas}</TableCell>
              <TableCell>{a.tokens.toLocaleString("pt-BR")}</TableCell>
              <TableCell>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(a.tokens / maxTok) * 100}%` }} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}