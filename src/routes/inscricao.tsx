import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileSignature, Loader2, Paperclip, Printer } from "lucide-react";
import { toast } from "sonner";

import { InscricaoDigitalFields } from "@/components/inscricoes/inscricao-digital-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { abrirFichaInscricaoParaImpressao } from "@/lib/ficha-inscricao-print";
import {
  DADOS_INSCRICAO_VAZIOS,
  dadosInscricaoDigitalSchema,
  type DadosInscricaoDigital,
} from "@/lib/inscricao-digital";
import { criarInscricaoFormulario } from "@/lib/inscricoes-digitais.functions";
import { ORIGEM_PUBLICA } from "@/lib/site";

export const Route = createFileRoute("/inscricao")({
  head: () => ({
    meta: [
      { title: "Inscrição · Mulheres Conectadas" },
      {
        name: "description",
        content:
          "Preencha sua inscrição gratuita no Mulheres Conectadas e informe suas preferências de turno e localização.",
      },
      { property: "og:title", content: "Inscrição · Mulheres Conectadas" },
      {
        property: "og:description",
        content:
          "Inscreva-se para a formação gratuita em tecnologia do Mulheres Conectadas. A coordenação fará a alocação na turma mais adequada.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${ORIGEM_PUBLICA}/inscricao` },
      {
        property: "og:image",
        content: `${ORIGEM_PUBLICA}/marca/og-mulheres-conectadas.png`,
      },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Mulher desenvolvendo habilidades digitais no projeto Mulheres Conectadas",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Inscrição · Mulheres Conectadas" },
      {
        name: "twitter:description",
        content:
          "Preencha sua inscrição gratuita e informe suas preferências de turno e localização.",
      },
      {
        name: "twitter:image",
        content: `${ORIGEM_PUBLICA}/marca/og-mulheres-conectadas.png`,
      },
      {
        name: "twitter:image:alt",
        content: "Mulher desenvolvendo habilidades digitais no projeto Mulheres Conectadas",
      },
    ],
  }),
  component: InscricaoPublicaPage,
});

const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const MIMES_ACEITOS = ["application/pdf", "image/png", "image/jpeg"];

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function validarArquivo(file: File, rotulo: string): void {
  if (!MIMES_ACEITOS.includes(file.type)) {
    throw new Error(`${rotulo}: envie um arquivo PDF, JPG ou PNG.`);
  }
  if (file.size > TAMANHO_MAXIMO) {
    throw new Error(`${rotulo}: o arquivo deve ter no máximo 10 MB.`);
  }
}

function InscricaoPublicaPage() {
  const [dados, setDados] = useState<DadosInscricaoDigital>({
    ...DADOS_INSCRICAO_VAZIOS,
    contatos_emergencia: DADOS_INSCRICAO_VAZIOS.contatos_emergencia.map((contato) => ({
      ...contato,
    })),
  });
  const [documento, setDocumento] = useState<File | null>(null);
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [aceiteFisico, setAceiteFisico] = useState(false);
  const [website, setWebsite] = useState("");
  const [protocolo, setProtocolo] = useState<string | null>(null);

  const enviar = useMutation({
    mutationFn: async () => {
      if (dados.identifica_se_mulher === "nao") {
        throw new Error(
          "Agradecemos muito o seu interesse. Conforme o edital, esta edição do Mulheres Conectadas é destinada exclusivamente a mulheres e, por isso, não conseguimos concluir esta inscrição.",
        );
      }
      if (!documento) throw new Error("Anexe um documento com foto (RG ou CNH).");
      validarArquivo(documento, "Documento com foto");
      if (comprovante) validarArquivo(comprovante, "Comprovante de endereço");
      if (!aceiteFisico) throw new Error("Confirme que a ficha física será impressa e assinada.");
      const validacao = dadosInscricaoDigitalSchema.safeParse(dados);
      if (!validacao.success) throw new Error(validacao.error.issues[0]?.message);
      const [documentoBase64, comprovanteBase64] = await Promise.all([
        arquivoParaBase64(documento),
        comprovante ? arquivoParaBase64(comprovante) : Promise.resolve(null),
      ]);
      return criarInscricaoFormulario({
        data: {
          dados: validacao.data,
          aceiteFisico: true,
          website,
          documento: {
            nome: documento.name,
            mime: documento.type,
            base64: documentoBase64,
          },
          comprovante:
            comprovanteBase64 && comprovante
              ? { nome: comprovante.name, mime: comprovante.type, base64: comprovanteBase64 }
              : undefined,
        },
      });
    },
    onSuccess: (resultado) => {
      setProtocolo(resultado.id);
      setDados((atual) => ({ ...atual, autorizacao_dados_em: resultado.autorizacaoDadosEm }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success("Inscrição enviada para revisão.");
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível enviar a inscrição."),
  });

  const imprimir = () =>
    abrirFichaInscricaoParaImpressao({
      protocolo: protocolo ?? undefined,
      projetoNome: "Mulheres Conectadas",
      turmaNome: "A definir pela coordenação",
      dados,
    });

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 md:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          to="/mulheres-conectadas"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-secondary"
        >
          <ArrowLeft className="size-4" /> Conhecer o projeto
        </Link>
        <header className="flex flex-col gap-3 rounded-2xl bg-primary px-6 py-7 text-primary-foreground shadow-sm md:px-10">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-2">
              <FileSignature className="size-7" />
            </div>
            <div>
              <p className="text-sm font-medium opacity-80">Mulheres Conectadas</p>
              <h1 className="text-2xl font-bold md:text-3xl">Ficha digital de matrícula</h1>
            </div>
          </div>
          <p className="max-w-2xl text-sm opacity-90">
            Preencha seus dados, preferências e contatos de emergência. A coordenação fará a
            alocação na turma mais adequada. Depois do envio, imprima a ficha preenchida: a via
            física assinada continua obrigatória.
          </p>
        </header>

        {protocolo ? (
          <Card className="border-emerald-300 bg-emerald-50">
            <CardHeader>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 size-7 text-emerald-700" />
                <div>
                  <CardTitle className="text-emerald-950">Inscrição recebida</CardTitle>
                  <CardDescription className="mt-1 text-emerald-800">
                    Protocolo {protocolo}. Seus documentos foram arquivados com segurança. Agora
                    imprima a ficha, confira os dados e assine.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={imprimir}>
                <Printer className="mr-2 size-4" /> Imprimir ficha física
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Nova inscrição
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Dados da candidata</CardTitle>
              <CardDescription>
                Os campos marcados com * são obrigatórios. A turma será escolhida pela coordenação
                com base no município, referência e turno informados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-7">
              <InscricaoDigitalFields value={dados} onChange={setDados} />

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Documentos
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    PDF, JPG ou PNG, com até 10 MB por arquivo. Fotos serão arquivadas em PDF.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-lg border p-4">
                    <Label htmlFor="documento-foto">Documento com foto (RG/CNH) *</Label>
                    <Input
                      id="documento-foto"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      onChange={(e) => setDocumento(e.target.files?.[0] ?? null)}
                    />
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="size-3" />
                      {documento?.name ?? "Arquivo obrigatório"}
                    </p>
                  </div>
                  <div className="space-y-2 rounded-lg border p-4">
                    <Label htmlFor="comprovante-endereco">Comprovante de endereço (opcional)</Label>
                    <Input
                      id="comprovante-endereco"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
                    />
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="size-3" />
                      {comprovante?.name ?? "Pode ser entregue depois à coordenação"}
                    </p>
                  </div>
                </div>
              </section>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                <Checkbox
                  id="aceite-fisico"
                  checked={aceiteFisico}
                  onCheckedChange={(checked) => setAceiteFisico(checked === true)}
                />
                <Label htmlFor="aceite-fisico" className="font-normal leading-relaxed">
                  Estou ciente de que devo imprimir e assinar a ficha física para concluir a
                  matrícula.
                </Label>
              </div>
              <div className="hidden" aria-hidden="true">
                <Label htmlFor="website">Website</Label>
                <input
                  id="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="ghost" asChild>
                  <Link to="/auth">Acesso da equipe</Link>
                </Button>
                <Button onClick={() => enviar.mutate()} disabled={enviar.isPending}>
                  {enviar.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Enviar inscrição
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
