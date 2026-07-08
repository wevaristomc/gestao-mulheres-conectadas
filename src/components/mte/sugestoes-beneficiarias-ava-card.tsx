import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  listarSugestoesBeneficiariasDoAva,
  criarBeneficiariasDoAva,
} from "@/lib/ava-beneficiarias.functions";

type Sugestao = { moodle_id: number; nome: string; cpf: string; email: string | null };

function fmtCpf(cpf: string) {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function SugestoesBeneficiariasAvaCard() {
  const qc = useQueryClient();
  const listar = useServerFn(listarSugestoesBeneficiariasDoAva);
  const criar = useServerFn(criarBeneficiariasDoAva);

  const q = useQuery({
    queryKey: ["ava", "sugestoes-beneficiarias"],
    queryFn: async () => (await listar()) as { sugestoes: Sugestao[] },
  });

  const sugestoes = useMemo(() => q.data?.sugestoes ?? [], [q.data]);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());

  const allChecked = sugestoes.length > 0 && selecionadas.size === sugestoes.length;
  const toggleAll = () => {
    if (allChecked) setSelecionadas(new Set());
    else setSelecionadas(new Set(sugestoes.map((s) => s.moodle_id)));
  };
  const toggle = (id: number) => {
    setSelecionadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const run = useMutation({
    mutationFn: async () =>
      (await criar({ data: { moodle_ids: Array.from(selecionadas) } })) as {
        criadas: number; vinculadas: number; ignoradas: number;
      },
    onSuccess: (r) => {
      toast.success(
        `Beneficiárias: ${r.criadas} criadas · ${r.vinculadas} vinculadas · ${r.ignoradas} ignoradas`,
      );
      setSelecionadas(new Set());
      qc.invalidateQueries({ queryKey: ["ava"] });
      qc.invalidateQueries({ queryKey: ["mte", "beneficiarias"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao criar beneficiárias"),
  });

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Beneficiárias sugeridas pelo AVA
        </h3>
        <p className="text-xs text-muted-foreground">
          Alunas do Moodle com CPF válido que ainda não estão cadastradas como beneficiárias.
          Selecione para criar em lote — o cadastro é mínimo (nome, CPF, e-mail) e fica marcado
          como <em>"Cadastro incompleto — origem AVA"</em> para completar depois.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => run.mutate()}
          disabled={run.isPending || selecionadas.size === 0}
        >
          {run.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <UserPlus className="mr-2 h-4 w-4" />}
          Criar {selecionadas.size > 0 ? `${selecionadas.size} ` : ""}beneficiária{selecionadas.size === 1 ? "" : "s"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
        >
          {q.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar lista
        </Button>
      </div>

      {q.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{(q.error as Error).message}</div>
        </div>
      ) : null}
      {run.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{(run.error as Error).message}</div>
        </div>
      ) : null}
      {run.data ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> {run.data.criadas} criadas · {run.data.vinculadas} vinculadas · {run.data.ignoradas} ignoradas
        </div>
      ) : null}

      <div className="rounded-md border max-h-80 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Selecionar todas" />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>E-mail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : sugestoes.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma sugestão — todas as alunas do AVA já estão cruzadas ou não têm CPF válido.
              </TableCell></TableRow>
            ) : (
              sugestoes.map((s) => (
                <TableRow key={s.moodle_id}>
                  <TableCell>
                    <Checkbox
                      checked={selecionadas.has(s.moodle_id)}
                      onCheckedChange={() => toggle(s.moodle_id)}
                      aria-label={`Selecionar ${s.nome}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{s.nome}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtCpf(s.cpf)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.email ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}