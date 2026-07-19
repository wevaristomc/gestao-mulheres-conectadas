import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileSignature, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { InscricaoDigitalFields } from "@/components/inscricoes/inscricao-digital-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { abrirFichaInscricaoParaImpressao } from "@/lib/ficha-inscricao-print";
import {
  DADOS_INSCRICAO_VAZIOS,
  dadosInscricaoDigitalSchema,
  type DadosInscricaoDigital,
} from "@/lib/inscricao-digital";
import { criarInscricaoFormulario } from "@/lib/inscricoes-digitais.functions";

export const Route = createFileRoute("/inscricao")({
  head: () => ({ meta: [{ title: "Inscrição · Mulheres Conectadas" }] }),
  component: InscricaoPublicaPage,
});

function InscricaoPublicaPage() {
  const [dados, setDados] = useState<DadosInscricaoDigital>({ ...DADOS_INSCRICAO_VAZIOS });
  const [aceiteFisico, setAceiteFisico] = useState(false);
  const [website, setWebsite] = useState("");
  const [protocolo, setProtocolo] = useState<string | null>(null);

  const enviar = useMutation({
    mutationFn: async () => {
      if (!aceiteFisico) throw new Error("Confirme que a ficha física será impressa e assinada.");
      const validacao = dadosInscricaoDigitalSchema.safeParse(dados);
      if (!validacao.success) throw new Error(validacao.error.issues[0]?.message);
      return criarInscricaoFormulario({
        data: { dados: validacao.data, aceiteFisico: true, website },
      });
    },
    onSuccess: (resultado) => {
      setProtocolo(resultado.id);
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
            Preencha seus dados e suas preferências de localização e turno. A coordenação fará a
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
                    Protocolo {protocolo}. Agora imprima a ficha, confira os dados e assine.
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
                  onChange={(event) => setWebsite(event.target.value)}
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
