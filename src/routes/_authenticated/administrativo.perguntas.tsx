import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  listarInscricaoPerguntasAdmin,
  removerInscricaoPergunta,
  salvarInscricaoPergunta,
  type PerguntaCustomizada,
} from "@/lib/inscricao-perguntas.functions";
export const Route = createFileRoute("/_authenticated/administrativo/perguntas")({
  component: PerguntasPage,
});
const TIPOS = [
  "texto_curto",
  "texto_longo",
  "selecao_unica",
  "selecao_multipla",
  "sim_nao",
  "numero",
  "data",
] as const;
function PerguntasPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "perguntas"],
    queryFn: () => listarInscricaoPerguntasAdmin(),
  });
  const [edicao, setEdicao] = useState<PerguntaCustomizada | null>(null);
  const salvar = useMutation({
    mutationFn: salvarInscricaoPergunta,
    onSuccess: () => {
      toast.success("Pergunta salva.");
      setEdicao(null);
      qc.invalidateQueries({ queryKey: ["admin", "perguntas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: removerInscricaoPergunta,
    onSuccess: () => {
      toast.success("Pergunta desativada.");
      qc.invalidateQueries({ queryKey: ["admin", "perguntas"] });
    },
  });
  const novo = () =>
    setEdicao({
      id: undefined,
      chave: "",
      label: "",
      tipo: "texto_curto",
      opcoes: [],
      obrigatoria: false,
      ajuda: "",
      ativo: true,
      ordem: q.data?.length ?? 0,
    });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Perguntas da inscrição</h2>
          <p className="text-sm text-muted-foreground">
            Campos adicionais exibidos no formulário público.
          </p>
        </div>
        <Button onClick={novo}>+ Adicionar pergunta</Button>
      </div>
      {edicao && (
        <Card>
          <CardHeader>
            <CardTitle>{edicao.id ? "Editar pergunta" : "Nova pergunta"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Chave (slug)</Label>
              <Input
                value={edicao.chave}
                onChange={(e) => setEdicao({ ...edicao, chave: e.target.value })}
              />
            </div>
            <div>
              <Label>Label</Label>
              <Input
                value={edicao.label}
                onChange={(e) => setEdicao({ ...edicao, label: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={edicao.tipo}
                onChange={(e) =>
                  setEdicao({ ...edicao, tipo: e.target.value as PerguntaCustomizada["tipo"] })
                }
              >
                {TIPOS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Ajuda</Label>
              <Input
                value={edicao.ajuda ?? ""}
                onChange={(e) => setEdicao({ ...edicao, ajuda: e.target.value })}
              />
            </div>
            {["selecao_unica", "selecao_multipla"].includes(edicao.tipo) && (
              <div className="md:col-span-2">
                <Label>Opções (uma por linha)</Label>
                <Textarea
                  value={edicao.opcoes.join("\n")}
                  onChange={(e) =>
                    setEdicao({
                      ...edicao,
                      opcoes: e.target.value
                        .split("\n")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            )}
            <label className="flex items-center gap-2">
              <Switch
                checked={edicao.obrigatoria}
                onCheckedChange={(v) => setEdicao({ ...edicao, obrigatoria: v })}
              />{" "}
              Obrigatória
            </label>
            <div className="flex gap-2">
              <Button onClick={() => salvar.mutate({ data: edicao })}>Salvar</Button>
              <Button variant="ghost" onClick={() => setEdicao(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {(q.data ?? []).map((p) => (
          <Card key={p.id} className={!p.ativo ? "opacity-60" : ""}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{p.label}</p>
                <p className="text-sm text-muted-foreground">
                  {p.chave} · {p.tipo}
                  {p.obrigatoria ? " · obrigatória" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEdicao(p)}>
                  Editar
                </Button>
                {p.id && (
                  <Button
                    variant="destructive"
                    onClick={() => remover.mutate({ data: { id: p.id! } })}
                  >
                    Desativar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
