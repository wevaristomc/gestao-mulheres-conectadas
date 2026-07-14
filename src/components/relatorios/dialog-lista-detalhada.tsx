import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { turmasMteListOptions } from "@/lib/mte-queries";
import { formatarDataBR } from "@/lib/date-utils";

// Lista Detalhada por turma — XLSX com 3 abas (FREQUENCIA / Lanche / BeneficiosCertificadoTransporte).
// Fidelidade ao modelo oficial: matriz educanda × dia de aula.

type Aula = {
  id: string;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  ch_prevista: number | null;
};
type Matricula = {
  id: string;
  frequencia_percentual: number | null;
  status: string | null;
  beneficiaria_id: string;
  beneficiarias?: { nome?: string; cpf?: string } | null;
};

function matriculaAtiva(m: Matricula): boolean {
  const s = String(m.status ?? "").toLowerCase();
  return s !== "evadida" && s !== "desistente";
}

function ordenarAulas(aulas: Aula[]): Aula[] {
  return [...aulas].sort((a, b) => {
    const byDate = String(a.data ?? "").localeCompare(String(b.data ?? ""));
    if (byDate !== 0) return byDate;
    const byTime = String(a.hora_inicio ?? "99:99").slice(0, 5).localeCompare(String(b.hora_inicio ?? "99:99").slice(0, 5));
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

export function DialogListaDetalhada({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const turmasQ = useQuery(turmasMteListOptions());
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>("");
  const [gerando, setGerando] = useState(false);

  const turma = useMemo(() => turmas.find((t) => t.id === turmaId), [turmas, turmaId]);

  async function gerar() {
    if (!turma) {
      toast.error("Selecione uma turma.");
      return;
    }
    setGerando(true);
    try {
      // 1. Aulas
      const aulasR = await supabase
        .from("aulas")
        .select("id, data, hora_inicio, hora_fim, ch_prevista")
        .eq("turma_id", turma.id)
        .order("data", { ascending: true })
        .order("hora_inicio", { ascending: true, nullsFirst: false });
      if (aulasR.error) throw new Error(aulasR.error.message);
      const aulas = ordenarAulas((aulasR.data ?? []) as Aula[]);
      // P10 — bloqueia geração vazia.
      if (aulas.length === 0) {
        toast.error("Esta turma não tem aulas cadastradas. Cadastre aulas antes de exportar a lista detalhada.");
        return;
      }

      // 2. Matrículas
      const matR = await supabase
        .from("matriculas")
        .select(
          "id, frequencia_percentual, status, beneficiaria_id, beneficiarias(nome, cpf)",
        )
        .eq("turma_id", turma.id);
      if (matR.error) throw new Error(matR.error.message);
      const matriculas = ((matR.data ?? []) as unknown as Matricula[])
        .filter(matriculaAtiva)
        .sort((a, b) =>
          (a.beneficiarias?.nome ?? "").localeCompare(b.beneficiarias?.nome ?? "", "pt-BR"),
        );
      if (matriculas.length === 0) {
        toast.error("Nenhuma cursista ativa nesta turma. Ative ao menos uma matrícula antes de exportar.");
        return;
      }

      // 3. Presenças
      const presR = await supabase
        .from("presencas")
        .select("aula_id, matricula_id, presente")
        .in(
          "aula_id",
          aulas.map((a) => a.id),
        );
      const presMap = new Map<string, boolean>();
      for (const p of (presR.data ?? []) as {
        aula_id: string;
        matricula_id: string;
        presente: boolean;
      }[]) {
        presMap.set(`${p.aula_id}::${p.matricula_id}`, p.presente);
      }

      // 4. Entregas benefícios/materiais (best-effort — se tabela indisponível segue vazio)
      const entRB = await supabase
        .from("entregas_beneficios")
        .select("matricula_id, descricao, tipo, categoria")
        .in(
          "matricula_id",
          matriculas.map((m) => m.id),
        );
      const entRM = await supabase
        .from("entregas_materiais")
        .select("matricula_id, descricao, tipo, categoria")
        .in(
          "matricula_id",
          matriculas.map((m) => m.id),
        );
      const entrRows = [
        ...(((entRB.data ?? []) as unknown as EntregaRow[]) || []),
        ...(((entRM.data ?? []) as unknown as EntregaRow[]) || []),
      ];

      const wb = XLSX.utils.book_new();

      // Aba FREQUENCIA
      const aulaHeader = aulas.map((a) =>
        [
          formatarDataBR(a.data),
          a.hora_inicio && a.hora_fim ? `${a.hora_inicio}-${a.hora_fim}` : "",
          a.ch_prevista ? `${a.ch_prevista}h` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      const chSomaPossivel = aulas.reduce((s, a) => s + Number(a.ch_prevista ?? 0), 0);

      const freqHeader = [
        "Nº",
        "Nome",
        "CPF",
        ...aulaHeader,
        "% Frequência",
        "Faltas",
        "CH cumprida",
        "Status",
      ];
      const freqRows: (string | number)[][] = [freqHeader];
      matriculas.forEach((m, i) => {
        let presentes = 0;
        let chCumprida = 0;
        const linha: (string | number)[] = [i + 1, m.beneficiarias?.nome ?? "", m.beneficiarias?.cpf ?? ""];
        aulas.forEach((a) => {
          const v = presMap.get(`${a.id}::${m.id}`);
          if (v === true) {
            linha.push("P");
            presentes += 1;
            chCumprida += Number(a.ch_prevista ?? 0);
          } else if (v === false) linha.push("F");
          else linha.push("");
        });
        const pct = aulas.length ? (presentes / aulas.length) : 0;
        const faltas = aulas.length - presentes;
        linha.push(Math.round(pct * 1000) / 10);
        linha.push(faltas);
        linha.push(chCumprida);
        const st =
          m.status === "concluinte"
            ? "Concluinte"
            : m.status === "evadida"
              ? "Evadido"
              : pct >= 0.75 && chSomaPossivel > 0
                ? "Concluinte"
                : "—";
        linha.push(st);
        freqRows.push(linha);
      });
      const wsFreq = XLSX.utils.aoa_to_sheet(freqRows);
      XLSX.utils.book_append_sheet(wb, wsFreq, "FREQUENCIA");

      // Aba Lanche — mesma matriz, valor: L (entregue) se marcado como presente (proxy),
      // caso não haja tabela específica de lanche. Placeholder para preenchimento manual.
      const lancheRows: (string | number)[][] = [freqHeader.slice(0, 3 + aulas.length)];
      matriculas.forEach((m, i) => {
        const linha: (string | number)[] = [i + 1, m.beneficiarias?.nome ?? "", m.beneficiarias?.cpf ?? ""];
        aulas.forEach((a) => {
          const v = presMap.get(`${a.id}::${m.id}`);
          linha.push(v === true ? "L" : "");
        });
        lancheRows.push(linha);
      });
      const wsLanche = XLSX.utils.aoa_to_sheet(lancheRows);
      XLSX.utils.book_append_sheet(wb, wsLanche, "Lanche");

      // Aba BeneficiosCertificadoTransporte
      const benefHeader = [
        "Nº",
        "Nome",
        "CPF",
        "Recebeu Auxílio Transporte",
        "Recebeu Kit Aluno",
        "Recebeu camisetas",
        "Recebeu Material Didático",
        "Recebeu Certificado",
      ];
      const benefRows: (string | number)[][] = [benefHeader];
      matriculas.forEach((m, i) => {
        const entregas = entrRows.filter((e) => e.matricula_id === m.id);
        const has = (re: RegExp) =>
          entregas.some((e) =>
            [e.descricao, e.tipo, e.categoria]
              .filter(Boolean)
              .some((s) => re.test(String(s))),
          );
        const cert =
          m.status === "concluinte" ? "SIM" : "NÃO";
        benefRows.push([
          i + 1,
          m.beneficiarias?.nome ?? "",
          m.beneficiarias?.cpf ?? "",
          has(/transport/i) ? "SIM" : "NÃO",
          has(/kit/i) ? "SIM" : "NÃO",
          has(/camiseta/i) ? "SIM" : "NÃO",
          has(/material|did[aá]tic/i) ? "SIM" : "NÃO",
          cert,
        ]);
      });
      const wsBenef = XLSX.utils.aoa_to_sheet(benefRows);
      XLSX.utils.book_append_sheet(wb, wsBenef, "BeneficiosCertificadoTransporte");

      const codigo = (turma.codigo_turma ?? "turma").replace(/[^\w-]+/g, "-");
      XLSX.writeFile(wb, `lista-detalhada_${codigo}.xlsx`);
      toast.success("Lista detalhada gerada.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar lista detalhada.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!gerando ? onOpenChange(o) : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lista Detalhada por Turma (XLSX)</DialogTitle>
          <DialogDescription>
            Três abas: FREQUENCIA (matriz educanda × aula), Lanche (mesma matriz), e
            BeneficiosCertificadoTransporte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Turma</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={turmaId}
            onChange={(e) => setTurmaId(e.target.value)}
          >
            <option value="">Selecione uma turma…</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.codigo_turma ?? "—"} · {t.nome_curso ?? "Turma"}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={gerar} disabled={gerando || !turmaId}>
            {gerando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Baixar XLSX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EntregaRow = {
  matricula_id: string;
  descricao?: string | null;
  tipo?: string | null;
  categoria?: string | null;
};