import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  beneficiariasByCpfs,
  ensureTurmaMinima,
  importBeneficiariasBulk,
  upsertMatriculasBulk,
  type Beneficiaria,
} from "@/lib/mte-queries";
import { parseCsvTurma, type ResultadoImportacaoCsv } from "@/lib/importador-turma-csv";

type Resumo = {
  arquivo: string;
  turma: string | null;
  turmaId?: string;
  benef: number;
  matr: number;
  erro?: string;
};

export function ImportarTurmaCsvCard() {
  const qc = useQueryClient();
  const [previews, setPreviews] = useState<ResultadoImportacaoCsv[]>([]);
  const [resumos, setResumos] = useState<Resumo[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const parsed: ResultadoImportacaoCsv[] = [];
    for (const f of Array.from(files)) {
      const text = await f.text();
      parsed.push(parseCsvTurma(f.name, text));
    }
    setPreviews(parsed);
    setResumos([]);
  };

  const importar = useMutation({
    mutationFn: async () => {
      const out: Resumo[] = [];
      for (const p of previews) {
        try {
          if (!p.turma.codigo_turma) {
            out.push({ arquivo: p.arquivo, turma: null, benef: 0, matr: 0, erro: "Sem código de turma." });
            continue;
          }
          if (!p.alunas.length) {
            out.push({ arquivo: p.arquivo, turma: p.turma.codigo_turma, benef: 0, matr: 0, erro: "Sem alunas válidas." });
            continue;
          }
          // 1. Turma
          const turmaId = await ensureTurmaMinima({
            codigo_turma: p.turma.codigo_turma,
            turno: p.turma.turno,
            municipio: p.turma.municipio,
          });
          // 2. Beneficiárias (upsert por CPF)
          const benef: Partial<Beneficiaria>[] = p.alunas.map((a) => ({
            nome: a.nome,
            cpf: a.cpf,
            municipio: p.turma.municipio,
            banco: a.banco,
            agencia: a.agencia,
            conta: a.conta,
          }));
          const rBenef = await importBeneficiariasBulk(benef);
          // 3. Descobre ids das beneficiárias (upsert pode não retornar todas)
          const mapa = await beneficiariasByCpfs(p.alunas.map((a) => a.cpf));
          const matriculas = p.alunas
            .map((a) => {
              const id = mapa[a.cpf];
              if (!id) return null;
              return {
                turma_id: turmaId,
                beneficiaria_id: id,
                assinou_lista: a.assinou_lista,
                observacao_importacao: a.observacao_importacao,
              };
            })
            .filter(Boolean) as Parameters<typeof upsertMatriculasBulk>[0];
          const rMat = await upsertMatriculasBulk(matriculas);
          out.push({
            arquivo: p.arquivo,
            turma: p.turma.codigo_turma,
            turmaId,
            benef: rBenef.inserted,
            matr: rMat.upserted,
          });
        } catch (e) {
          out.push({
            arquivo: p.arquivo,
            turma: p.turma.codigo_turma,
            benef: 0,
            matr: 0,
            erro: e instanceof Error ? e.message : "Falha desconhecida",
          });
        }
      }
      return out;
    },
    onSuccess: (out) => {
      setResumos(out);
      const totBenef = out.reduce((a, x) => a + x.benef, 0);
      const totMat = out.reduce((a, x) => a + x.matr, 0);
      const totTurmas = out.filter((x) => x.turmaId).length;
      toast.success(`${totTurmas} turmas · ${totBenef} beneficiárias · ${totMat} matrículas`);
      qc.invalidateQueries({ queryKey: ["mte"] });
      setPreviews([]);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao importar"),
  });

  const totalValidas = previews.reduce((a, p) => a + p.alunas.length, 0);
  const totalErros = previews.reduce((a, p) => a + p.erros.length, 0);

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileUp className="h-4 w-4" /> Importar turma + alunas (CSV bancário)
        </h3>
        <p className="text-xs text-muted-foreground">
          Um CSV por turma. Detecta código (ex.: JBT-MC-01), turno e município pelo nome/1ª linha,
          e cria turma mínima + beneficiárias com banco/agência/conta + matrículas.
          Duplicatas são atualizadas.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Arquivos CSV (podem ser vários)</Label>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          className="text-sm"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {previews.length ? (
        <div className="space-y-2">
          <div className="flex gap-2 text-xs">
            <Badge variant="secondary">{previews.length} arquivo(s)</Badge>
            <Badge className="bg-emerald-100 text-emerald-800">{totalValidas} alunas válidas</Badge>
            {totalErros > 0 ? (
              <Badge className="bg-red-100 text-red-800">{totalErros} erros</Badge>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {previews.map((p, i) => (
              <div key={i} className="p-2 text-xs space-y-1">
                <div className="font-medium">
                  {p.arquivo}
                  {p.turma.codigo_turma ? (
                    <> — <span className="text-primary">{p.turma.codigo_turma}</span>
                      {p.turma.turno ? ` · ${p.turma.turno}` : ""}
                      {p.turma.municipio ? ` · ${p.turma.municipio}` : ""}
                    </>
                  ) : (
                    <span className="text-destructive"> — código não detectado</span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {p.alunas.length} alunas válidas
                  {p.erros.length ? ` · ${p.erros.length} erros` : ""}
                </div>
                {p.erros.length ? (
                  <div className="text-destructive/80 space-y-0.5 max-h-24 overflow-y-auto">
                    {p.erros.slice(0, 5).map((e, k) => <div key={k}>{e}</div>)}
                    {p.erros.length > 5 ? <div>… e mais {p.erros.length - 5}.</div> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <Button onClick={() => importar.mutate()} disabled={importar.isPending || totalValidas === 0}>
            {importar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Importar {previews.length} arquivo(s)
          </Button>
        </div>
      ) : null}

      {resumos.length ? (
        <div className="rounded-md border divide-y">
          {resumos.map((r, i) => (
            <div key={i} className="flex items-center justify-between p-2 text-xs">
              <div className="flex items-center gap-2">
                {r.erro ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                <span className="font-medium">{r.turma ?? r.arquivo}</span>
              </div>
              <div className="text-muted-foreground">
                {r.erro
                  ? r.erro
                  : `${r.benef} benef. · ${r.matr} matr.`}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}