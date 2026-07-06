import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { gerarAnaliseAba } from "@/lib/relatorios.functions";

type Aba = "frequencia" | "pedagogico" | "orcamentario" | "metas";

export function AnaliseIA({
  aba,
  projetoNome,
  getContexto,
  disabled,
}: {
  aba: Aba;
  projetoNome: string | null;
  getContexto: () => string | null;
  disabled?: boolean;
}) {
  const call = useServerFn(gerarAnaliseAba);
  const [texto, setTexto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function gerar() {
    const contexto = getContexto();
    if (!contexto) {
      toast.error("Sem dados suficientes para análise.");
      return;
    }
    setLoading(true);
    setTexto(null);
    try {
      const res = await call({ data: { aba, projetoNome, contexto } });
      setTexto(res.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar análise");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <Button size="sm" variant="secondary" onClick={gerar} disabled={loading || disabled}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Gerar Análise com IA
      </Button>
      {texto ? (
        <Card className="mt-3">
          <CardContent className="prose prose-sm dark:prose-invert max-w-none py-4 whitespace-pre-wrap">
            {texto}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}