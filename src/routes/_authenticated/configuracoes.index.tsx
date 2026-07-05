import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveContext } from "@/hooks/use-active-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  component: ConfiguracoesGeral,
});

type ProjetoRow = Record<string, unknown> & { id: string; nome: string };

function projetoOptions(projetoId: string | null) {
  return queryOptions({
    queryKey: ["configuracoes", "projeto", projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<{ row: ProjetoRow | null; error?: string }> => {
      if (!projetoId) return { row: null };
      const { data, error } = await supabase
        .from("projetos")
        .select("*")
        .eq("id", projetoId)
        .maybeSingle();
      if (error) return { row: null, error: error.message };
      return { row: (data ?? null) as ProjetoRow | null };
    },
  });
}

type FormState = {
  nome: string;
  vigencia_inicio: string;
  vigencia_fim: string;
  valor_global: string;
  custo_aluno_hora: string;
  executora_nome: string;
  cnpj: string;
  endereco: string;
};

const EMPTY: FormState = {
  nome: "",
  vigencia_inicio: "",
  vigencia_fim: "",
  valor_global: "",
  custo_aluno_hora: "",
  executora_nome: "",
  cnpj: "",
  endereco: "",
};

// Aliases aceitos por campo (para lidar com nomes de coluna variantes).
const FIELD_ALIASES: Record<keyof FormState, string[]> = {
  nome: ["nome", "titulo"],
  vigencia_inicio: ["vigencia_inicio", "data_inicio", "inicio"],
  vigencia_fim: ["vigencia_fim", "data_fim", "fim"],
  valor_global: ["valor_global", "valor_total", "orcamento_total"],
  custo_aluno_hora: ["custo_aluno_hora", "custo_hora_aluno", "custo_por_aluno_hora"],
  executora_nome: ["executora_nome", "executora", "razao_social"],
  cnpj: ["cnpj", "executora_cnpj"],
  endereco: ["endereco", "executora_endereco"],
};

function pickString(row: ProjetoRow | null, keys: string[]): string {
  if (!row) return "";
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v;
  }
  return "";
}

function toDateInput(v: string): string {
  if (!v) return "";
  // Aceita ISO com hora — pega apenas YYYY-MM-DD.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : v;
}

function toNumberOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const normalized = t.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function ConfiguracoesGeral() {
  const { projetoId, role } = useActiveContext();
  const qc = useQueryClient();
  const projetoQ = useQuery(projetoOptions(projetoId));
  const row = projetoQ.data?.row ?? null;
  const readOnly = role !== "coordenador_geral";

  const initial = useMemo<FormState>(() => {
    if (!row) return EMPTY;
    return {
      nome: pickString(row, FIELD_ALIASES.nome),
      vigencia_inicio: toDateInput(pickString(row, FIELD_ALIASES.vigencia_inicio)),
      vigencia_fim: toDateInput(pickString(row, FIELD_ALIASES.vigencia_fim)),
      valor_global: pickString(row, FIELD_ALIASES.valor_global),
      custo_aluno_hora: pickString(row, FIELD_ALIASES.custo_aluno_hora),
      executora_nome: pickString(row, FIELD_ALIASES.executora_nome),
      cnpj: pickString(row, FIELD_ALIASES.cnpj),
      endereco: pickString(row, FIELD_ALIASES.endereco),
    };
  }, [row]);

  const [form, setForm] = useState<FormState>(EMPTY);
  useEffect(() => setForm(initial), [initial]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  );

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!projetoId) throw new Error("Nenhum projeto ativo.");
      // Monta payload apenas com nomes canônicos; se colunas não existirem,
      // remove e tenta novamente.
      const payload: Record<string, unknown> = {
        nome: form.nome.trim() || null,
        vigencia_inicio: form.vigencia_inicio || null,
        vigencia_fim: form.vigencia_fim || null,
        valor_global: toNumberOrNull(form.valor_global),
        custo_aluno_hora: toNumberOrNull(form.custo_aluno_hora),
        executora_nome: form.executora_nome.trim() || null,
        cnpj: form.cnpj.trim() || null,
        endereco: form.endereco.trim() || null,
      };
      // nunca envia null para nome — coluna costuma ser NOT NULL
      if (!payload.nome) payload.nome = form.nome;

      let attempts = 0;
      while (attempts < 6) {
        const res = await supabase
          .from("projetos")
          .update(payload)
          .eq("id", projetoId);
        if (!res.error) return;
        const msg = res.error.message;
        const m = /column "?([a-zA-Z0-9_]+)"? .* does not exist/i.exec(msg);
        if (m && m[1] && m[1] in payload) {
          delete payload[m[1]];
          attempts++;
          continue;
        }
        throw new Error(msg);
      }
      throw new Error("Não foi possível salvar as configurações do projeto.");
    },
    onSuccess: () => {
      toast.success("Configurações do projeto atualizadas.");
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
      // atualiza também o seletor global de projetos
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!projetoId) {
    return (
      <div className="rounded-md border bg-muted/40 p-6 text-sm text-muted-foreground">
        Selecione um projeto no menu superior para editar suas configurações.
      </div>
    );
  }

  if (projetoQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const erro = projetoQ.data?.error;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly && dirty) salvarMut.mutate();
      }}
    >
      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Não foi possível carregar o projeto</div>
            <div className="text-xs opacity-80">{erro}</div>
          </div>
        </div>
      ) : null}

      {readOnly ? (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Somente a Coordenação Geral pode editar as configurações do projeto.
          Você está visualizando em modo leitura.
        </div>
      ) : null}

      <section className="rounded-md border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Parâmetros do projeto</h2>
          <p className="text-xs text-muted-foreground">
            Nome, vigência, valor global e custo aluno-hora usados nos indicadores.
          </p>
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="nome">Nome do projeto</Label>
            <Input
              id="nome"
              className="mt-1"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              disabled={readOnly}
              required
            />
          </div>
          <div>
            <Label htmlFor="vig_ini">Início da vigência</Label>
            <Input
              id="vig_ini"
              type="date"
              className="mt-1"
              value={form.vigencia_inicio}
              onChange={(e) => setForm((f) => ({ ...f, vigencia_inicio: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div>
            <Label htmlFor="vig_fim">Fim da vigência</Label>
            <Input
              id="vig_fim"
              type="date"
              className="mt-1"
              value={form.vigencia_fim}
              onChange={(e) => setForm((f) => ({ ...f, vigencia_fim: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div>
            <Label htmlFor="valor_global">Valor global (R$)</Label>
            <Input
              id="valor_global"
              inputMode="decimal"
              className="mt-1"
              placeholder="0,00"
              value={form.valor_global}
              onChange={(e) => setForm((f) => ({ ...f, valor_global: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div>
            <Label htmlFor="cah">Custo aluno-hora (R$)</Label>
            <Input
              id="cah"
              inputMode="decimal"
              className="mt-1"
              placeholder="0,00"
              value={form.custo_aluno_hora}
              onChange={(e) => setForm((f) => ({ ...f, custo_aluno_hora: e.target.value }))}
              disabled={readOnly}
            />
          </div>
        </div>
      </section>

      <section className="rounded-md border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Executora</h2>
          <p className="text-xs text-muted-foreground">
            Dados institucionais da organização executora do projeto.
          </p>
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="exec_nome">Razão social</Label>
            <Input
              id="exec_nome"
              className="mt-1"
              value={form.executora_nome}
              onChange={(e) => setForm((f) => ({ ...f, executora_nome: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div>
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              className="mt-1"
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Textarea
              id="endereco"
              rows={3}
              className="mt-1"
              value={form.endereco}
              onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
              disabled={readOnly}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setForm(initial)}
          disabled={!dirty || salvarMut.isPending}
        >
          Descartar
        </Button>
        <Button type="submit" disabled={readOnly || !dirty || salvarMut.isPending}>
          {salvarMut.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1 h-3.5 w-3.5" />
          )}
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}