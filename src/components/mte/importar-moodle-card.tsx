import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Database, Loader2, Mail, Upload, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { importarDumpMoodle } from "@/lib/moodle-import.functions";
import {
  sincronizarEmailsBeneficiariasFromAva,
  listarProfessoresUltimoAva,
} from "@/lib/moodle-sync.functions";

type Resumo = Record<string, number>;
type Professor = { moodle_id: number; nome: string; email: string | null; cpf: string | null; sem_conta: boolean };

export function ImportarMoodleCard() {
  const [file, setFile] = useState<File | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [profOpen, setProfOpen] = useState(false);
  const importar = useServerFn(importarDumpMoodle);
  const sincronizarEmails = useServerFn(sincronizarEmailsBeneficiariasFromAva);
  const listarProfessores = useServerFn(listarProfessoresUltimoAva);

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
      })) as { importacao_id: string; resumo: Resumo; professores: Professor[] };
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

  const syncEmails = useMutation({
    mutationFn: async () => (await sincronizarEmails()) as { atualizadas: number; verificadas: number },
    onSuccess: (r) => toast.success(
      r.atualizadas > 0
        ? `${r.atualizadas} beneficiária(s) atualizada(s) com e-mail do AVA.`
        : "Nenhuma beneficiária sem e-mail encontrou correspondência no AVA.",
    ),
    onError: (e: Error) => toast.error(e.message || "Falha ao sincronizar."),
  });

  const profQ = useQuery({
    queryKey: ["professores-ultimo-ava"],
    queryFn: () =>
      listarProfessores() as Promise<{
        importacao_id: string | null; criado_em: string | null; professores: Professor[];
      }>,
    enabled: profOpen,
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

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run.mutate()} disabled={!file || run.isPending}>
          {run.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Importar dump
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncEmails.mutate()}
          disabled={syncEmails.isPending}
          title="Preenche o e-mail de beneficiárias já vinculadas ao AVA que estão sem e-mail no cadastro."
        >
          {syncEmails.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          Sincronizar e-mails com AVA
        </Button>
        <Dialog open={profOpen} onOpenChange={setProfOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Users className="mr-2 h-4 w-4" />
              Professores no AVA
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Professores identificados no último dump AVA</DialogTitle>
            </DialogHeader>
            {profQ.isLoading ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
              </div>
            ) : profQ.data && profQ.data.professores.length > 0 ? (
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead className="text-right">Conta no app</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profQ.data.professores.map((p) => (
                      <TableRow key={p.moodle_id}>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell className="text-xs">{p.email ?? "—"}</TableCell>
                        <TableCell className="text-xs">{p.cpf ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs">
                          {p.sem_conta ? (
                            <span className="text-amber-600 dark:text-amber-400">Sem cadastro</span>
                          ) : p.email ? (
                            <span className="text-emerald-700 dark:text-emerald-400">OK</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Nenhum professor identificado no último dump. Reimporte o dump para que os papéis (teacher/editingteacher) sejam capturados.
              </div>
            )}
          </DialogContent>
        </Dialog>
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
            <div>E-mails preenchidos: <strong className="text-foreground">{resumo.emails_beneficiarias ?? 0}</strong></div>
            <div>Telefones preenchidos: <strong className="text-foreground">{resumo.telefones_beneficiarias ?? 0}</strong></div>
            <div>Professores no dump: <strong className="text-foreground">{resumo.professores_no_dump ?? 0}</strong></div>
            <div>Prof. sem conta: <strong className="text-foreground">{resumo.professores_sem_conta ?? 0}</strong></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}