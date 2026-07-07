import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Image as ImageIcon, Loader2, Mic, MessageSquare, Sparkles, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  analisarImagens, gerarResumoGrupo, listarRemetentes, purgarImportacao,
  transcreverAudios, vincularRemetente,
} from "@/lib/whatsapp.functions";
import {
  importacaoOptions, mensagensOptions, midiaAnalisesOptions, resumosGrupoOptions,
} from "@/lib/whatsapp-queries";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/whatsapp/$importacaoId")({
  component: ImportacaoDetalhe,
});

function ImportacaoDetalhe() {
  const { importacaoId } = Route.useParams();
  const qc = useQueryClient();
  const impQ = useQuery(importacaoOptions(importacaoId));
  const imp = impQ.data;
  const msgsQ = useQuery(mensagensOptions(importacaoId, 500));
  const analisesQ = useQuery(midiaAnalisesOptions(importacaoId));
  const analisesById = useMemo(() => {
    const map = new Map<string, { transcricao?: string | null; ocr?: string | null; descricao?: string | null }>();
    for (const a of analisesQ.data?.rows ?? []) {
      const cur = map.get(a.mensagem_id) ?? {};
      if (a.tipo_analise === "transcricao") cur.transcricao = a.transcricao ?? cur.transcricao;
      if (a.tipo_analise === "imagem") { cur.ocr = a.ocr_texto ?? cur.ocr; cur.descricao = a.descricao_ia ?? cur.descricao; }
      map.set(a.mensagem_id, cur);
    }
    return map;
  }, [analisesQ.data]);

  const transcFn = useServerFn(transcreverAudios);
  const analisarFn = useServerFn(analisarImagens);
  const purgarFn = useServerFn(purgarImportacao);

  const transcMut = useMutation({
    mutationFn: async () => transcFn({ data: { importacao_id: importacaoId } }),
    onSuccess: (r) => {
      toast.success(`Áudios processados: ${r.ok}/${r.total} (${r.fail} falharam)`);
      qc.invalidateQueries({ queryKey: ["wa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const imgMut = useMutation({
    mutationFn: async () => analisarFn({ data: { importacao_id: importacaoId } }),
    onSuccess: (r) => {
      toast.success(`Imagens analisadas: ${r.ok}/${r.total} (${r.fail} falharam)`);
      qc.invalidateQueries({ queryKey: ["wa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const purgarMut = useMutation({
    mutationFn: async () => purgarFn({ data: { importacao_id: importacaoId } }),
    onSuccess: () => {
      toast.success("Importação purgada");
      qc.invalidateQueries({ queryKey: ["wa"] });
      window.location.href = "/whatsapp";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!imp && !impQ.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Importação não encontrada. <Link to="/whatsapp" className="text-primary hover:underline">Voltar</Link></div>
    );
  }

  return (
    <div>
      <PageHeader
        title={imp ? `Importação · ${imp.arquivo_zip_nome ?? "sem nome"}` : "Importação"}
        description={
          imp && imp.periodo_inicio
            ? `Período: ${new Date(imp.periodo_inicio).toLocaleDateString("pt-BR")} — ${imp.periodo_fim ? new Date(imp.periodo_fim).toLocaleDateString("pt-BR") : "?"}`
            : "Detalhe da importação"
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/whatsapp"><ArrowLeft className="mr-1 h-4 w-4" /> Grupos</Link>
        </Button>
        {imp ? (
          <>
            <Badge variant="secondary"><MessageSquare className="mr-1 h-3 w-3" /> {imp.total_mensagens ?? 0} msg</Badge>
            <Badge variant="secondary"><Mic className="mr-1 h-3 w-3" /> {imp.total_audios ?? 0} áudio</Badge>
            <Badge variant="secondary"><ImageIcon className="mr-1 h-3 w-3" /> {imp.total_imagens ?? 0} img</Badge>
            <Badge variant="secondary"><Users className="mr-1 h-3 w-3" /> {imp.total_remetentes ?? 0} remetentes</Badge>
          </>
        ) : null}

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => transcMut.mutate()} disabled={transcMut.isPending}>
            {transcMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
            Transcrever áudios
          </Button>
          <Button size="sm" variant="outline" onClick={() => imgMut.mutate()} disabled={imgMut.isPending}>
            {imgMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
            Analisar imagens
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost"><Trash2 className="mr-2 h-4 w-4" /> Purgar</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Purgar esta importação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Apaga o .zip, todas as mídias, mensagens e análises. Ação irreversível.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => purgarMut.mutate()}>Purgar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="mensagens">
        <TabsList>
          <TabsTrigger value="mensagens">Mensagens</TabsTrigger>
          <TabsTrigger value="midias">Mídias</TabsTrigger>
          <TabsTrigger value="vinculos">Vincular remetentes</TabsTrigger>
          <TabsTrigger value="resumo">Relatório IA</TabsTrigger>
        </TabsList>

        <TabsContent value="mensagens" className="mt-4">
          <MensagensLista importacaoId={importacaoId} analisesById={analisesById} />
        </TabsContent>
        <TabsContent value="midias" className="mt-4">
          <MidiasGrid importacaoId={importacaoId} />
        </TabsContent>
        <TabsContent value="vinculos" className="mt-4">
          <VincularRemetentes importacaoId={importacaoId} />
        </TabsContent>
        <TabsContent value="resumo" className="mt-4">
          {imp ? <ResumoIA grupoId={imp.grupo_id} inicio={imp.periodo_inicio} fim={imp.periodo_fim} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MensagensLista({
  importacaoId,
  analisesById,
}: {
  importacaoId: string;
  analisesById: Map<string, { transcricao?: string | null; ocr?: string | null; descricao?: string | null }>;
}) {
  const q = useQuery(mensagensOptions(importacaoId, 500));
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  const rows = q.data?.rows ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sem mensagens.</p>;
  return (
    <div className="rounded-md border">
      <div className="max-h-[65vh] overflow-y-auto divide-y">
        {rows.map((m) => {
          const a = analisesById.get(m.id);
          const extra = a?.transcricao || a?.ocr || a?.descricao;
          return (
            <div key={m.id} className="grid grid-cols-[110px_1fr] gap-3 p-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {new Date(m.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.remetente_nome ?? (m.tipo === "sistema" ? "— sistema —" : "?")}</span>
                  <Badge variant="outline" className="text-[10px]">{m.tipo}</Badge>
                  {m.remetente_fone_e164 ? <span className="text-xs text-muted-foreground">{m.remetente_fone_e164}</span> : null}
                </div>
                {m.conteudo_texto ? <p className="whitespace-pre-wrap">{m.conteudo_texto}</p> : null}
                {!m.conteudo_texto && m.midia_nome ? (
                  <p className="text-xs text-muted-foreground italic">📎 {m.midia_nome}</p>
                ) : null}
                {extra ? (
                  <div className="mt-1 rounded-md bg-muted/50 p-2 text-xs">
                    {a?.transcricao ? <div><span className="font-medium">Transcrição:</span> {a.transcricao}</div> : null}
                    {a?.ocr ? <div><span className="font-medium">OCR:</span> {a.ocr}</div> : null}
                    {a?.descricao && !a?.ocr ? <div><span className="font-medium">Descrição IA:</span> {a.descricao}</div> : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MidiasGrid({ importacaoId }: { importacaoId: string }) {
  const q = useQuery(mensagensOptions(importacaoId, 500));
  const rows = (q.data?.rows ?? []).filter((m) => m.midia_path);
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sem mídias.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
      {rows.map((m) => (
        <MidiaCard key={m.id} path={m.midia_path as string} tipo={m.tipo} nome={m.midia_nome} />
      ))}
    </div>
  );
}

function MidiaCard({ path, tipo, nome }: { path: string; tipo: string; nome: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useMemo(() => {
    supabase.storage.from("whatsapp").createSignedUrl(path, 600).then((r) => setUrl(r.data?.signedUrl ?? null));
  }, [path]);
  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <Badge variant="outline" className="text-[10px]">{tipo}</Badge>
          <span className="truncate text-[10px] text-muted-foreground" title={nome ?? ""}>{nome ?? "—"}</span>
        </div>
        {tipo === "imagem" && url ? (
          <img src={url} alt={nome ?? ""} className="h-40 w-full rounded object-cover" />
        ) : tipo === "audio" && url ? (
          <audio src={url} controls className="w-full" />
        ) : url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir</a>
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

function VincularRemetentes({ importacaoId }: { importacaoId: string }) {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarRemetentes);
  const vincFn = useServerFn(vincularRemetente);
  const q = useQuery({
    queryKey: ["wa", "remetentes", importacaoId],
    queryFn: async () => await listarFn({ data: { importacao_id: importacaoId } }),
  });

  const [search, setSearch] = useState("");
  const benefsQ = useQuery({
    queryKey: ["wa", "beneficiarias-busca", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("beneficiarias")
        .select("id, nome, cpf")
        .or(`nome.ilike.%${search}%,cpf.ilike.%${search.replace(/\D/g, "")}%`)
        .limit(20);
      return (data ?? []) as Array<{ id: string; nome: string; cpf: string }>;
    },
  });

  const [fone, setFone] = useState<string | null>(null);

  const vincMut = useMutation({
    mutationFn: async (payload: { fone_e164: string; beneficiaria_id: string }) =>
      vincFn({ data: { importacao_id: importacaoId, ...payload, atualizar_cadastro: true } }),
    onSuccess: () => {
      toast.success("Vínculo salvo (telefone gravado no cadastro se estava vazio).");
      qc.invalidateQueries({ queryKey: ["wa"] });
      setFone(null); setSearch("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  const remetentes = q.data?.remetentes ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_360px]">
      <div className="rounded-md border">
        <div className="max-h-[65vh] overflow-y-auto divide-y">
          {remetentes.map((r) => (
            <button
              key={r.fone}
              onClick={() => setFone(r.fone)}
              className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 p-3 text-left hover:bg-accent/40 ${fone === r.fone ? "bg-accent/60" : ""}`}
            >
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.nome ?? "?"}</span>
                  <span className="text-xs text-muted-foreground">{r.fone}</span>
                  {r.beneficiaria_id ? <Badge variant="secondary">vinculada</Badge> : null}
                  {r.sugestao ? <Badge variant="outline">sugestão: {r.sugestao.nome}</Badge> : null}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{r.count} msg</span>
            </button>
          ))}
          {!remetentes.length ? <p className="p-4 text-sm text-muted-foreground">Sem remetentes identificados.</p> : null}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Vincular à beneficiária</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {fone ? (
            <>
              <p className="text-xs text-muted-foreground">Telefone selecionado: <span className="font-mono">{fone}</span></p>
              <div className="grid gap-1.5">
                <Label className="text-xs">Buscar aluna (nome ou CPF)</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite ao menos 2 letras" />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {(benefsQ.data ?? []).map((b) => (
                  <button
                    key={b.id}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent/40"
                    onClick={() => vincMut.mutate({ fone_e164: fone, beneficiaria_id: b.id })}
                    disabled={vincMut.isPending}
                  >
                    <div className="font-medium">{b.nome}</div>
                    <div className="text-xs text-muted-foreground">{b.cpf}</div>
                  </button>
                ))}
                {benefsQ.isFetching ? <div className="p-2 text-xs text-muted-foreground">Buscando…</div> : null}
                {search.length >= 2 && !(benefsQ.data ?? []).length && !benefsQ.isFetching ? (
                  <div className="p-2 text-xs text-muted-foreground">Nenhuma aluna encontrada.</div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Selecione um remetente na lista para vincular.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoIA({ grupoId, inicio, fim }: { grupoId: string; inicio: string | null; fim: string | null }) {
  const qc = useQueryClient();
  const fn = useServerFn(gerarResumoGrupo);
  const [ini, setIni] = useState(inicio ? inicio.slice(0, 10) : "");
  const [f, setF] = useState(fim ? fim.slice(0, 10) : "");
  const [texto, setTexto] = useState<string | null>(null);
  const historicoQ = useQuery(resumosGrupoOptions(grupoId));

  const mut = useMutation({
    mutationFn: async () => fn({
      data: {
        grupo_id: grupoId,
        inicio: `${ini}T00:00:00-03:00`,
        fim: `${f}T23:59:59-03:00`,
      },
    }),
    onSuccess: (r) => {
      setTexto(r.markdown);
      qc.invalidateQueries({ queryKey: ["wa", "resumos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 py-4 md:grid-cols-[1fr_1fr_auto]">
          <div className="grid gap-1.5">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => mut.mutate()} disabled={!ini || !f || mut.isPending}>
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Gerar relatório
            </Button>
          </div>
        </CardContent>
      </Card>

      {texto ? (
        <Card>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap py-4">
            {texto}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
        <div className="grid gap-2">
          {(historicoQ.data?.rows ?? []).map((r: any) => (
            <Card key={r.id}>
              <CardContent className="py-3 text-sm">
                <div className="mb-2 text-xs text-muted-foreground">
                  {new Date(r.data_inicio).toLocaleDateString("pt-BR")} — {new Date(r.data_fim).toLocaleDateString("pt-BR")} · {r.autor_ia}
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-primary">ver conteúdo</summary>
                  <div className="prose prose-sm dark:prose-invert mt-2 max-w-none whitespace-pre-wrap">{r.markdown}</div>
                </details>
              </CardContent>
            </Card>
          ))}
          {!(historicoQ.data?.rows ?? []).length ? (
            <p className="text-xs text-muted-foreground">Nenhum relatório gerado ainda.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}