/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { DepoimentoCard } from "@/components/landing/depoimento-card";
import { HeroVideoAdminCard } from "@/components/landing/hero-video-admin-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useHasRole } from "@/hooks/use-active-context";
import {
  listarLandingHeroConfigAdmin,
  salvarLandingHeroConfig,
  type LandingConteudo,
} from "@/lib/landing-config.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  alternarLandingDepoimento,
  atualizarLandingDepoimento,
  criarLandingDepoimento,
  excluirLandingDepoimento,
  listarLandingDepoimentosAdmin,
  reordenarLandingDepoimentos,
  type LandingDepoimento,
} from "@/lib/landing-depoimentos.functions";

export const Route = createFileRoute("/_authenticated/administrativo/depoimentos")({
  component: DepoimentosLandingPage,
});

const PAPEIS_GESTAO = ["coordenador_geral", "coordenador_pedagogico", "administrativo"] as const;
const LIMITE_VIDEO = 50 * 1024 * 1024;

const CONTEUDO_PADRAO = {
  hero: {
    selo: "Formação, autonomia e novos caminhos",
    titulo: "Tecnologia para transformar possibilidades em futuro.",
    subtitulo:
      "O Mulheres Conectadas oferece formação gratuita em tecnologia e inovação digital para mulheres de Belo Horizonte, Betim e Juatuba, com aprendizado prático, acolhimento e conexão com o mundo do trabalho.",
    cta_texto: "Quero fazer minha inscrição",
    cta_secundario_texto: "Conhecer a formação",
    aviso_analise:
      "A inscrição é gratuita e passa por análise. O envio do formulário não garante a vaga.",
  },
  metricas: [
    { valor: "150h", rotulo: "de formação híbrida" },
    { valor: "600", rotulo: "mulheres nos dois ciclos" },
    { valor: "12", rotulo: "turmas previstas" },
    { valor: "75%", rotulo: "frequência para certificação" },
  ],
  projeto: {
    titulo: "Mais mulheres preparadas para ocupar o presente digital.",
    paragrafo1:
      "Mulheres Conectadas é uma ação de qualificação social e profissional que aproxima mulheres em situação de vulnerabilidade das competências mais usadas na vida digital e em áreas de tecnologia.",
    paragrafo2:
      "A proposta combina conhecimento, prática e acompanhamento para fortalecer a autonomia, ampliar possibilidades de inserção produtiva e reduzir desigualdades de gênero no setor tecnológico.",
    feature1_titulo: "Acolhimento e permanência",
    feature1_texto:
      "Materiais, transporte e lanche estão previstos no plano de trabalho para apoiar a participação, conforme as regras da execução.",
    feature2_titulo: "Conexão com oportunidades",
    feature2_texto:
      "Desenvolvimento de competências alinhadas a Programação Web e Suporte de TI, sem promessa de contratação.",
  },
  jornada: {
    titulo: "150 horas para aprender, praticar e avançar.",
    subtitulo:
      "A matriz formativa é híbrida e reúne conhecimentos básicos e específicos, com atividades práticas e acompanhamento de frequência.",
    trilhas: [
      {
        horas: "40h",
        titulo: "Formação Digital",
        texto:
          "Letramento digital, comunicação, raciocínio lógico, cidadania, relações de trabalho e uso seguro da tecnologia.",
      },
      {
        horas: "55h",
        titulo: "Suporte de TI",
        texto:
          "Sistemas operacionais, hardware, redes locais, atendimento ao usuário, segurança, backup e privacidade.",
      },
      {
        horas: "55h",
        titulo: "Programação Web",
        texto:
          "Fundamentos para construir soluções web, desenvolver o raciocínio de programação e apresentar projetos.",
      },
    ],
  },
  comoParticipar: {
    titulo: "Sua inscrição começa agora.",
    subtitulo:
      "Preencha seus dados e informe suas preferências de turno e localização. A coordenação analisa a inscrição e faz a alocação na turma mais adequada.",
    passos: [
      {
        titulo: "Preencha",
        texto: "Informe seus dados e suas preferências de turno e localização.",
      },
      { titulo: "Aguarde", texto: "A coordenação analisa a inscrição e faz a alocação na turma." },
      { titulo: "Assine", texto: "Imprima e assine a ficha física obrigatória." },
    ],
    elegibilidade: [
      "Mulheres em situação de vulnerabilidade social.",
      "Residentes em Belo Horizonte, Betim ou Juatuba.",
      "Pessoas com deficiência: 10% das vagas de cada turma são reservadas.",
    ],
  },
};

function LandingTextEditor({
  conteudo,
  config,
  onChange,
  onSaved,
}: {
  conteudo: LandingConteudo;
  config?: Awaited<ReturnType<typeof listarLandingHeroConfigAdmin>>;
  onChange: (value: LandingConteudo) => void;
  onSaved: () => void;
}) {
  const merged = {
    ...CONTEUDO_PADRAO,
    ...conteudo,
    hero: { ...CONTEUDO_PADRAO.hero, ...((conteudo.hero as object) ?? {}) },
    projeto: { ...CONTEUDO_PADRAO.projeto, ...((conteudo.projeto as object) ?? {}) },
    jornada: { ...CONTEUDO_PADRAO.jornada, ...((conteudo.jornada as object) ?? {}) },
    comoParticipar: {
      ...CONTEUDO_PADRAO.comoParticipar,
      ...((conteudo.comoParticipar as object) ?? {}),
    },
  } as any;
  const setBloco = (bloco: string, campo: string, valor: string) =>
    onChange({ ...conteudo, [bloco]: { ...(merged[bloco] ?? {}), [campo]: valor } });
  const setArray = (bloco: string, campo: string, itens: any[]) =>
    onChange({
      ...conteudo,
      [bloco]: campo ? { ...(merged[bloco] ?? {}), [campo]: itens } : itens,
    });
  const salvar = useMutation({
    mutationFn: () => {
      const obrigatorios = [
        merged.hero.selo,
        merged.hero.titulo,
        merged.hero.subtitulo,
        merged.projeto.titulo,
        merged.jornada.titulo,
        merged.comoParticipar.titulo,
      ].map(String);
      if (obrigatorios.some((v) => !v.trim()))
        throw new Error("Preencha todos os campos obrigatórios antes de salvar.");
      return salvarLandingHeroConfig({
        data: {
          heroVideoPath: config?.heroVideoPath ?? null,
          heroPosterPath: config?.heroPosterPath ?? null,
          heroVideoSom: config?.heroVideoSom ?? false,
          conteudo,
        },
      });
    },
    onSuccess: () => {
      toast.success("Textos da landing salvos.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const campo = (bloco: string, chave: string, label: string, area = false) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      {area ? (
        <Textarea
          value={merged[bloco]?.[chave] ?? ""}
          onChange={(e) => setBloco(bloco, chave, e.target.value)}
        />
      ) : (
        <Input
          value={merged[bloco]?.[chave] ?? ""}
          onChange={(e) => setBloco(bloco, chave, e.target.value)}
        />
      )}
    </div>
  );
  const mover = (bloco: string, chave: string, idx: number, delta: number) => {
    const arr = [...(merged[bloco]?.[chave] ?? [])];
    const alvo = idx + delta;
    if (alvo < 0 || alvo >= arr.length) return;
    [arr[idx], arr[alvo]] = [arr[alvo], arr[idx]];
    setArray(bloco, chave, arr);
  };
  const lista = (bloco: string, chave: string, labels: string[]) => (
    <div className="space-y-3">
      {(merged[bloco]?.[chave] ?? []).map((item: any, idx: number) => (
        <Card key={idx}>
          <CardContent className="space-y-2 p-3">
            {labels.map((label) => (
              <div key={label} className="space-y-1">
                <Label>{label}</Label>
                {label === "Texto" ? (
                  <Textarea
                    value={item[label === "Texto" ? "texto" : "rotulo"] ?? ""}
                    onChange={(e) => {
                      const arr = [...merged[bloco][chave]];
                      arr[idx] = {
                        ...arr[idx],
                        [label === "Texto" ? "texto" : "rotulo"]: e.target.value,
                      };
                      setArray(bloco, chave, arr);
                    }}
                  />
                ) : (
                  <Input
                    value={
                      item[
                        label === "Horas"
                          ? "horas"
                          : label === "Título"
                            ? "titulo"
                            : label === "Valor"
                              ? "valor"
                              : "rotulo"
                      ] ?? ""
                    }
                    onChange={(e) => {
                      const arr = [...merged[bloco][chave]];
                      arr[idx] = {
                        ...arr[idx],
                        [label === "Horas"
                          ? "horas"
                          : label === "Título"
                            ? "titulo"
                            : label === "Valor"
                              ? "valor"
                              : "rotulo"]: e.target.value,
                      };
                      setArray(bloco, chave, arr);
                    }}
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => mover(bloco, chave, idx, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => mover(bloco, chave, idx, 1)}
              >
                ↓
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() =>
                  setArray(
                    bloco,
                    chave,
                    (chave ? merged[bloco][chave] : merged[bloco]).filter(
                      (_: any, i: number) => i !== idx,
                    ),
                  )
                }
              >
                Remover
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setArray(bloco, chave, [
            ...(merged[bloco]?.[chave] ?? []),
            labels.includes("Horas")
              ? { horas: "", titulo: "", texto: "" }
              : labels.includes("Valor")
                ? { valor: "", rotulo: "" }
                : { titulo: "", texto: "" },
          ])
        }
      >
        + Adicionar item
      </Button>
    </div>
  );
  const restaurar = (bloco: string) => {
    const novo = { ...conteudo };
    delete novo[bloco];
    onChange(novo);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Textos da página</CardTitle>
        <CardDescription>Edite cada seção sem deploy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section>
          <h3 className="mb-3 text-lg font-semibold">Abertura</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {campo("hero", "selo", "Selo")}
            {campo("hero", "titulo", "Título do hero")}
            {campo("hero", "subtitulo", "Subtítulo", true)}
            {campo("hero", "cta_texto", "Texto do CTA")}
            {campo("hero", "cta_secundario_texto", "CTA secundário")}
            {campo("hero", "aviso_analise", "Aviso de análise", true)}
          </div>
          <Button variant="ghost" onClick={() => restaurar("hero")}>
            Restaurar texto original
          </Button>
        </section>
        <section>
          <h3 className="mb-3 text-lg font-semibold">Números</h3>
          {lista("metricas", "", ["Valor", "Rotulo"])}
          <Button variant="ghost" onClick={() => restaurar("metricas")}>
            Restaurar texto original
          </Button>
        </section>
        <section>
          <h3 className="mb-3 text-lg font-semibold">O Projeto</h3>
          <div className="grid gap-3">
            {campo("projeto", "titulo", "Título")}
            {campo("projeto", "paragrafo1", "Parágrafo 1", true)}
            {campo("projeto", "paragrafo2", "Parágrafo 2", true)}
            {campo("projeto", "feature1_titulo", "Feature 1 - título")}
            {campo("projeto", "feature1_texto", "Feature 1 - texto", true)}
            {campo("projeto", "feature2_titulo", "Feature 2 - título")}
            {campo("projeto", "feature2_texto", "Feature 2 - texto", true)}
          </div>
          <Button variant="ghost" onClick={() => restaurar("projeto")}>
            Restaurar texto original
          </Button>
        </section>
        <section>
          <h3 className="mb-3 text-lg font-semibold">Jornada de Aprendizagem</h3>
          {campo("jornada", "titulo", "Título")}
          {campo("jornada", "subtitulo", "Subtítulo", true)}
          {lista("jornada", "trilhas", ["Horas", "Título", "Texto"])}
          <Button variant="ghost" onClick={() => restaurar("jornada")}>
            Restaurar texto original
          </Button>
        </section>
        <section>
          <h3 className="mb-3 text-lg font-semibold">Como Participar</h3>
          {campo("comoParticipar", "titulo", "Título")}
          {campo("comoParticipar", "subtitulo", "Subtítulo", true)}
          {lista("comoParticipar", "passos", ["Título", "Texto"])}
          <div className="space-y-2">
            <Label>Elegibilidade</Label>
            {(merged.comoParticipar.elegibilidade ?? []).map((item: string, idx: number) => (
              <div className="flex gap-2" key={idx}>
                <Input
                  value={item}
                  onChange={(e) => {
                    const arr = [...merged.comoParticipar.elegibilidade];
                    arr[idx] = e.target.value;
                    setArray("comoParticipar", "elegibilidade", arr);
                  }}
                />
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    setArray(
                      "comoParticipar",
                      "elegibilidade",
                      merged.comoParticipar.elegibilidade.filter(
                        (_: string, i: number) => i !== idx,
                      ),
                    )
                  }
                >
                  Remover
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setArray("comoParticipar", "elegibilidade", [
                  ...merged.comoParticipar.elegibilidade,
                  "",
                ])
              }
            >
              + Adicionar item
            </Button>
          </div>
          <Button variant="ghost" onClick={() => restaurar("comoParticipar")}>
            Restaurar texto original
          </Button>
        </section>
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar textos
        </Button>
      </CardContent>
    </Card>
  );
}
function DepoimentosLandingPage() {
  const { hasAnyRole } = useHasRole();
  const podeGerenciar = hasAnyRole([...PAPEIS_GESTAO]);
  const queryClient = useQueryClient();
  const queryKey = ["landing-depoimentos", "admin"];
  const depoimentosQ = useQuery({
    queryKey,
    queryFn: () => listarLandingDepoimentosAdmin(),
    enabled: podeGerenciar,
  });
  const depoimentos = depoimentosQ.data ?? [];
  const conteudoQ = useQuery({
    queryKey: ["landing-conteudo", "admin"],
    queryFn: () => listarLandingHeroConfigAdmin(),
    enabled: podeGerenciar,
  });
  const [conteudo, setConteudo] = useState<LandingConteudo>({});
  const [conteudoCarregado, setConteudoCarregado] = useState(false);
  useEffect(() => {
    if (conteudoQ.data && !conteudoCarregado) {
      setConteudo(conteudoQ.data.conteudo ?? {});
      setConteudoCarregado(true);
    }
  }, [conteudoQ.data, conteudoCarregado]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [edicao, setEdicao] = useState<LandingDepoimento | null>(null);
  const [nome, setNome] = useState("");
  const [contexto, setContexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const operacao = useMutation({
    mutationFn: (acao: () => Promise<void>) => acao(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) => toast.error(error.message),
  });

  const abrirNovo = () => {
    setEdicao(null);
    setNome("");
    setContexto("");
    setArquivo(null);
    setDialogAberto(true);
  };

  const abrirEdicao = (depoimento: LandingDepoimento) => {
    setEdicao(depoimento);
    setNome(depoimento.nome);
    setContexto(depoimento.contexto);
    setArquivo(null);
    setDialogAberto(true);
  };

  const salvar = () =>
    operacao.mutate(async () => {
      const nomeTrim = nome.trim();
      const contextoTrim = contexto.trim();
      if (nomeTrim.length < 2) throw new Error("Informe o nome (mín. 2 caracteres).");
      if (contextoTrim.length < 2) throw new Error("Informe o contexto (mín. 2 caracteres).");
      if (edicao) {
        await atualizarLandingDepoimento({
          data: { id: edicao.id, nome: nomeTrim, contexto: contextoTrim },
        });
        toast.success("Depoimento atualizado.");
      } else {
        if (!arquivo) throw new Error("Selecione um vídeo MP4.");
        if (arquivo.type !== "video/mp4") throw new Error("O arquivo deve ser um vídeo MP4.");
        if (arquivo.size > LIMITE_VIDEO) throw new Error("O vídeo deve ter no máximo 50 MB.");
        const videoPath = `depoimentos/${crypto.randomUUID()}.mp4`;
        const { error: uploadError } = await supabase.storage
          .from("landing")
          .upload(videoPath, arquivo, {
            contentType: "video/mp4",
            upsert: false,
          });
        if (uploadError) throw new Error(`Falha no upload: ${uploadError.message}`);
        try {
          await criarLandingDepoimento({
            data: { nome: nomeTrim, contexto: contextoTrim, videoPath },
          });
        } catch (error) {
          await supabase.storage.from("landing").remove([videoPath]);
          throw error;
        }
        toast.success("Depoimento adicionado à landing.");
      }
      setDialogAberto(false);
    });

  const mover = (indice: number, direcao: -1 | 1) => {
    const destino = indice + direcao;
    if (destino < 0 || destino >= depoimentos.length) return;
    const ids = depoimentos.map((item) => item.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    operacao.mutate(async () => {
      await reordenarLandingDepoimentos({ data: { ids } });
      toast.success("Ordem atualizada.");
    });
  };

  if (!podeGerenciar) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Seu perfil não possui permissão para gerenciar a landing.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <HeroVideoAdminCard />
      <LandingTextEditor
        conteudo={conteudo}
        config={conteudoQ.data}
        onChange={setConteudo}
        onSaved={() => {
          setConteudoCarregado(false);
          conteudoQ.refetch();
        }}
      />

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Depoimentos</CardTitle>
            <CardDescription className="mt-1">
              Troque vídeos, textos e ordem sem alterar o código do site público.
            </CardDescription>
          </div>
          <Button onClick={abrirNovo}>
            <Plus className="mr-2 size-4" /> Adicionar depoimento
          </Button>
        </CardHeader>
        <CardContent>
          {depoimentosQ.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, indice) => (
                <Skeleton key={indice} className="h-80" />
              ))}
            </div>
          ) : depoimentosQ.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(depoimentosQ.error as Error).message}
            </div>
          ) : depoimentos.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {depoimentos.map((depoimento, indice) => (
                <Card key={depoimento.id} className={depoimento.ativo ? "" : "opacity-65"}>
                  <CardContent className="space-y-4 p-4">
                    <DepoimentoCard
                      nome={depoimento.nome}
                      contexto={depoimento.contexto}
                      videoUrl={depoimento.videoUrl}
                      variante="admin"
                    />
                    <div className="flex items-center justify-between rounded-md border p-2">
                      <Label htmlFor={`ativo-${depoimento.id}`}>Visível na landing</Label>
                      <Switch
                        id={`ativo-${depoimento.id}`}
                        checked={depoimento.ativo}
                        disabled={operacao.isPending}
                        onCheckedChange={(ativo) =>
                          operacao.mutate(async () => {
                            await alternarLandingDepoimento({ data: { id: depoimento.id, ativo } });
                            toast.success(ativo ? "Depoimento ativado." : "Depoimento ocultado.");
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        title="Mover para cima"
                        disabled={indice === 0 || operacao.isPending}
                        onClick={() => mover(indice, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Mover para baixo"
                        disabled={indice === depoimentos.length - 1 || operacao.isPending}
                        onClick={() => mover(indice, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => abrirEdicao(depoimento)}>
                        <Pencil className="mr-2 size-4" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={operacao.isPending}
                        onClick={() => {
                          if (!window.confirm(`Excluir o depoimento de ${depoimento.nome}?`))
                            return;
                          operacao.mutate(async () => {
                            await excluirLandingDepoimento({ data: { id: depoimento.id } });
                            toast.success("Depoimento excluído.");
                          });
                        }}
                      >
                        <Trash2 className="mr-2 size-4" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              Nenhum depoimento cadastrado. A landing usará os vídeos estáticos de segurança.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edicao ? "Editar depoimento" : "Adicionar depoimento"}</DialogTitle>
            <DialogDescription>
              {edicao
                ? "Atualize o nome e o contexto exibidos na landing."
                : "Envie um arquivo MP4 de até 50 MB."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="depoimento-nome">Nome</Label>
              <Input id="depoimento-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="depoimento-contexto">Contexto</Label>
              <Textarea
                id="depoimento-contexto"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                placeholder="Ex.: Aluna · Juatuba · Tarde"
              />
            </div>
            {!edicao ? (
              <div className="space-y-1.5">
                <Label htmlFor="depoimento-video">Vídeo MP4</Label>
                <Input
                  id="depoimento-video"
                  type="file"
                  accept="video/mp4,.mp4"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Limite: 50 MB.</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={operacao.isPending || !nome.trim() || !contexto.trim()}
            >
              {operacao.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : edicao ? (
                <Pencil className="mr-2 size-4" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
