import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Database, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { importarDumpMoodle } from "@/lib/moodle-import.functions";

type Resumo = Record<string, number>;

export function ImportarMoodleCard() {
  const [file, setFile] = useState<File | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const importar = useServerFn(importarDumpMoodle);

  const run = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione o arquivo .sql do dump.");
      setProgress("Enviando arquivo para o storage…");
      const stamp = Date.now();
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `moodle-dumps/${stamp}-${safe}`;
      const up = await supabase.storage
        .from("evidencias")
        .upload(path, file, { upsert: true, contentType: "application/sql" });
      if (up.error) throw new Error(up.error.message);
      setProgress("Processando dump — isso pode levar alguns minutos…");
      const r = (await importar({
        data: {
          storage_path: path,
          arquivo_nome: file.name,
          tamanho_bytes: file.size,
        },
      })) as { importacao_id: string; resumo: Resumo };
      return r;
    },
    onSuccess: (r) => {
      setResumo(r.resumo);
      setImportacaoId(r.importacao_id);
      setProgress("");
      toast.success("Dump importado com sucesso.");
    },
    onError: (e: Error) => {
      setProgress("");
      toast.error(e.message || "Falha ao importar dump");
    },
  });

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Database className="h-4 w-4" /> Importar dump do AVA/Moodle (.sql)
        </h3>
        <p className="text-xs text-muted-foreground">
          Faz o parse do dump (alunos, cursos, matrículas, atividades, conclusões e notas)
          e cruza automaticamente por CPF (aluno ↔ beneficiária) e código (curso ↔ turma).
          Somente administradores.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Arquivo .sql</Label>
        <input
          type="file"
          accept=".sql,text/sql,application/sql"
          className="text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="text-xs text-muted-foreground">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => run.mutate()} disabled={!file || run.isPending}>
          {run.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Importar dump
        </Button>
        {progress ? <span className="text-xs text-muted-foreground">{progress}</span> : null}
      </div>

      {run.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="whitespace-pre-wrap break-words">{(run.error as Error).message}</div>
        </div>
      ) : null}

      {resumo ? (
        <div className="rounded-md border p-2 text-xs space-y-1">
          <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Importação {importacaoId?.slice(0, 8)} concluída
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-muted-foreground">
            <div>Alunos: <strong className="text-foreground">{resumo.users}</strong></div>
            <div>Cursos: <strong className="text-foreground">{resumo.courses}</strong></div>
            <div>Matrículas: <strong className="text-foreground">{resumo.enrolments}</strong></div>
            <div>Atividades: <strong className="text-foreground">{resumo.activities}</strong></div>
            <div>Conclusões: <strong className="text-foreground">{resumo.completions}</strong></div>
            <div>Notas: <strong className="text-foreground">{resumo.grades}</strong></div>
            <div>Match alunos: <strong className="text-foreground">{resumo.matched_users}</strong></div>
            <div>Match cursos: <strong className="text-foreground">{resumo.matched_courses}</strong></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}