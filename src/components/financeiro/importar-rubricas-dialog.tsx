import { useMemo, useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatBRL, toNumber } from "@/lib/financeiro-queries";
import { atualizarRubricasPrevistas, type Rubrica } from "@/lib/rubricas-queries";
import {
  lerPlanilhaRubricas,
  normalizarCodigoRubrica,
  type ResultadoImportacaoRubricas,
} from "@/lib/rubricas-import";

export function ImportarRubricasDialog({ rubricas }: { rubricas: Rubrica[] }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [arquivo, setArquivo] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacaoRubricas | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const correspondencias = useMemo(() => {
    const porCodigo = new Map(
      rubricas.map((rubrica) => [normalizarCodigoRubrica(rubrica.codigo), rubrica]),
    );
    return (resultado?.rubricas ?? []).map((importada) => ({
      importada,
      atual: porCodigo.get(normalizarCodigoRubrica(importada.codigo)) ?? null,
    }));
  }, [resultado, rubricas]);

  const encontradas = correspondencias.filter((item) => item.atual);
  const naoEncontradas = correspondencias.filter((item) => !item.atual);

  function limpar() {
    setArquivo("");
    setResultado(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function lerArquivo(file: File) {
    setLendo(true);
    setResultado(null);
    setArquivo(file.name);
    try {
      setResultado(await lerPlanilhaRubricas(file));
    } catch (error) {
      limpar();
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLendo(false);
    }
  }

  async function aplicar() {
    const itens = encontradas.flatMap(({ atual, importada }) =>
      atual ? [{ id: atual.id, valor_previsto: importada.valorPrevisto }] : [],
    );
    if (!itens.length) return;

    setAplicando(true);
    try {
      await atualizarRubricasPrevistas(itens);
      await queryClient.invalidateQueries({ queryKey: ["financeiro", "rubricas"] });
      toast.success(
        `${itens.length} ${itens.length === 1 ? "rubrica atualizada" : "rubricas atualizadas"}.`,
      );
      setOpen(false);
      limpar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value && !aplicando) limpar();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar planilha
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atualizar rubricas pela planilha</DialogTitle>
          <DialogDescription>
            O sistema compara a coluna Código/Rubrica e atualiza apenas o valor previsto das
            rubricas já cadastradas. Despesas executadas não são alteradas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={lendo || aplicando}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void lerArquivo(file);
            }}
          />

          {lendo ? (
            <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo e validando a planilha…
            </div>
          ) : null}

          {resultado ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Resumo label="Arquivo" value={arquivo} />
                <Resumo label="Encontradas" value={String(encontradas.length)} />
                <Resumo label="Não encontradas" value={String(naoEncontradas.length)} />
              </div>

              {naoEncontradas.length || resultado.avisos.length ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Itens que exigem conferência</div>
                      {naoEncontradas.length ? (
                        <p className="mt-1">
                          Códigos não cadastrados (não serão alterados):{" "}
                          {naoEncontradas
                            .slice(0, 10)
                            .map((item) => item.importada.codigo)
                            .join(", ")}
                          {naoEncontradas.length > 10 ? "…" : ""}
                        </p>
                      ) : null}
                      {resultado.avisos.slice(0, 5).map((aviso) => (
                        <p key={aviso} className="mt-1">
                          {aviso}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-right">Atual</th>
                      <th className="px-3 py-2 text-right">Planilha</th>
                      <th className="px-3 py-2 text-left">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {correspondencias.map(({ importada, atual }) => (
                      <tr key={`${importada.codigo}-${importada.linha}`}>
                        <td className="px-3 py-2 font-mono text-xs">{importada.codigo}</td>
                        <td className="px-3 py-2 text-right">
                          {atual ? formatBRL(toNumber(atual.valor_previsto)) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatBRL(importada.valorPrevisto)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {atual ? "Pronta para atualizar" : "Código não cadastrado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={aplicando}>
            Cancelar
          </Button>
          <Button onClick={() => void aplicar()} disabled={!encontradas.length || aplicando}>
            {aplicando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Aplicar {encontradas.length || ""} atualizações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Resumo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold" title={value}>
        {value}
      </div>
    </div>
  );
}
