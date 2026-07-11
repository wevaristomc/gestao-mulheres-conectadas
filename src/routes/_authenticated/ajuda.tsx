import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sparkles, Search, HelpCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { requireModuleAccess } from "@/lib/auth-guard";
import { abrirOrbeComPergunta } from "@/components/ajuda/help-point";
import { GUIAS, FAQ, buscarAjuda, AJUDA } from "@/data/ajuda-conteudo";

type Search = { g?: string; q?: string };

export const Route = createFileRoute("/_authenticated/ajuda")({
  head: () => ({ meta: [{ title: "Ajuda · Painel Mulheres Conectadas" }] }),
  beforeLoad: () => requireModuleAccess("ajuda"),
  validateSearch: (s: Record<string, unknown>): Search => ({
    g: typeof s.g === "string" ? s.g : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: AjudaPage,
});

function AjudaPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [termo, setTermo] = useState(search.q ?? "");

  const resultados = useMemo(() => buscarAjuda(termo), [termo]);
  const guiaAtivo = useMemo(
    () => GUIAS.find((g) => g.slug === search.g) ?? null,
    [search.g],
  );

  function abrirGuia(slug: string) {
    navigate({ search: { ...search, g: slug } });
  }

  function limparGuia() {
    navigate({ search: { q: search.q } });
  }

  return (
    <div>
      <PageHeader
        title="Ajuda"
        description="Guias, exemplos e regras oficiais do painel Mulheres Conectadas."
      />

      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar em guias, campos e FAQ…"
            className="pl-8"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => abrirOrbeComPergunta("Preciso de ajuda para usar o painel. Por onde eu começo?")}
        >
          <Sparkles className="mr-1 h-4 w-4" /> Perguntar ao Orbe
        </Button>
      </div>

      {guiaAtivo ? (
        <GuiaDetalhe slug={guiaAtivo.slug} onVoltar={limparGuia} />
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">Guias por área</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {resultados.guias.map((g) => (
                <Card
                  key={g.slug}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => abrirGuia(g.slug)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{g.titulo}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{g.resumo}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {g.publico.map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {resultados.guias.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum guia corresponde à busca.</p>
              )}
            </div>
          </section>

          {termo && resultados.entries.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">Campos e conceitos</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {resultados.entries.map((e) => (
                  <Card key={e.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{e.titulo}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-muted-foreground">{e.explicacao}</p>
                      {e.exemplo && (
                        <div className="rounded-md border bg-muted/40 p-2 text-xs">
                          <span className="font-medium">Exemplo: </span>
                          <span className="text-muted-foreground">{e.exemplo}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">Perguntas frequentes</h2>
            <Card>
              <CardContent className="pt-4">
                <Accordion type="single" collapsible>
                  {resultados.faq.map((f, i) => (
                    <AccordionItem key={i} value={`faq-${i}`}>
                      <AccordionTrigger className="text-sm text-left">{f.pergunta}</AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground">
                        {f.resposta}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                  {resultados.faq.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma pergunta encontrada.</p>
                  )}
                </Accordion>
              </CardContent>
            </Card>
          </section>

          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-2 text-sm">
                <HelpCircle className="h-4 w-4 text-primary" />
                <span>Ainda com dúvida? Pergunte ao Orbe — ele conhece o app e as regras do programa.</span>
              </div>
              <Button
                onClick={() => abrirOrbeComPergunta("Me dê um resumo das regras principais do Mulheres Conectadas: frequência mínima, PMQ, cotações e DEQ.")}
              >
                <Sparkles className="mr-1 h-4 w-4" /> Abrir Orbe
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function GuiaDetalhe({ slug, onVoltar }: { slug: string; onVoltar: () => void }) {
  const g = GUIAS.find((x) => x.slug === slug);
  if (!g) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Guia não encontrado.</p>
        <Button variant="link" onClick={onVoltar}>← Voltar</Button>
      </div>
    );
  }
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onVoltar}>← Voltar aos guias</Button>
      <Card className="mt-3">
        <CardHeader>
          <CardTitle>{g.titulo}</CardTitle>
          <p className="text-sm text-muted-foreground">{g.resumo}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Passo a passo</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {g.passos.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.titulo}.</span>{" "}
                  <span className="text-muted-foreground">{p.detalhe}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Regras do programa</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {g.regras.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>

          {g.erros_comuns && g.erros_comuns.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Erros comuns</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {g.erros_comuns.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => abrirOrbeComPergunta(`Explique passo a passo o guia "${g.titulo}" do painel Mulheres Conectadas.`)}
            >
              <Sparkles className="mr-1 h-4 w-4" /> Perguntar ao Orbe sobre este guia
            </Button>
            <Button asChild variant="outline">
              <Link to="/ajuda">Ver todos os guias</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Exporta AJUDA para permitir referências externas sem re-importar do data module.
export { AJUDA };
