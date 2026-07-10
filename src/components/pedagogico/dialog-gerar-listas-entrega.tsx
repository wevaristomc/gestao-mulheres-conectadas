import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { turmasMteListOptions, type TurmaMTE } from "@/lib/mte-queries";
import {
  baixarBlob,
  gerarListaEntregaBeneficiosPDF,
  gerarListaEntregaKitPDF,
  TIPOS_KIT_LABEL,
  type CabecalhoEntrega,
  type CursistaEntrega,
  type TipoKit,
} from "@/lib/lista-entrega-gerador";

type TipoLista = "kit" | "beneficios";

export function DialogGerarListasEntrega({
  open,
  onOpenChange,
  turmaId: turmaIdProp,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  turmaId?: string;
}) {
  const turmasQ = useQuery(turmasMteListOptions());
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>(turmaIdProp ?? "");
  useEffect(() => {
    if (turmaIdProp) setTurmaId(turmaIdProp);
  }, [turmaIdProp]);

  const [tipoLista, setTipoLista] = useState<TipoLista>("kit");
  const [tipoKit, setTipoKit] = useState<TipoKit>("kit_aluno");
  const [respNome, setRespNome] = useState("");
  const [respCPF, setRespCPF] = useState("");
  const [data, setData] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [horario, setHorario] = useState("");
  const [instrutor, setInstrutor] = useState("");
  const [gerando, setGerando] = useState(false);

  const turma = useMemo(() => turmas.find((t) => t.id === turmaId), [turmas, turmaId]);

  async function gerar() {
    if (!turma) {
      toast.error("Selecione uma turma.");
      return;
    }
    setGerando(true);
    try {
      const cursistas = await buscarCursistas(turmaId);
      const cab = cabecalhoDeTurma(turma, {
        responsavelNome: respNome.trim() || null,
        responsavelCPF: respCPF.trim() || null,
        data,
        horario: horario.trim() || null,
      });
      let blob: Blob;
      let sufixo: string;
      if (tipoLista === "kit") {
        blob = await gerarListaEntregaKitPDF({
          cabecalho: cab,
          cursistas,
          tipoSelecionado: tipoKit,
          instrutorNome: instrutor.trim() || null,
        });
        sufixo = `kit-${tipoKit}`;
      } else {
        blob = await gerarListaEntregaBeneficiosPDF({ cabecalho: cab, cursistas });
        sufixo = "beneficios";
      }
      const codigo = (turma.codigo_turma ?? "turma").replace(/[^\w-]+/g, "-");
      baixarBlob(blob, `lista-entrega_${sufixo}_${codigo}_${data}.pdf`);
      toast.success("Lista de entrega gerada.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar lista.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!gerando ? onOpenChange(o) : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar lista de entrega</DialogTitle>
          <DialogDescription>
            Modelo oficial DEQ/PMQ — kits/EPI/camisetas ou benefícios (transporte/alimentação).
          </DialogDescription>
        </DialogHeader>

        {!turmaIdProp ? (
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
        ) : null}

        <div className="space-y-2">
          <Label>Tipo de lista</Label>
          <RadioGroup
            value={tipoLista}
            onValueChange={(v) => setTipoLista(v as TipoLista)}
            className="grid grid-cols-1 gap-2"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="kit" /> Kit / material / EPI / camisetas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="beneficios" /> Benefícios (transporte / alimentação)
            </label>
          </RadioGroup>
        </div>

        {tipoLista === "kit" ? (
          <div className="space-y-1.5">
            <Label>Item entregue</Label>
            <RadioGroup
              value={tipoKit}
              onValueChange={(v) => setTipoKit(v as TipoKit)}
              className="grid grid-cols-1 gap-1.5"
            >
              {(Object.keys(TIPOS_KIT_LABEL) as TipoKit[]).map((k, idx) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={k} />
                  {idx + 1}. {TIPOS_KIT_LABEL[k]}
                </label>
              ))}
            </RadioGroup>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Responsável pela entrega</Label>
            <Input value={respNome} onChange={(e) => setRespNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>CPF do responsável</Label>
            <Input value={respCPF} onChange={(e) => setRespCPF(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Horário</Label>
            <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </div>
          {tipoLista === "kit" ? (
            <div className="col-span-2 space-y-1.5">
              <Label>Instrutor/a (rodapé)</Label>
              <Input value={instrutor} onChange={(e) => setInstrutor(e.target.value)} />
            </div>
          ) : null}
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
            Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cabecalhoDeTurma(
  turma: TurmaMTE,
  extras: {
    responsavelNome: string | null;
    responsavelCPF: string | null;
    data: string | null;
    horario: string | null;
  },
): CabecalhoEntrega {
  const ident = `${turma.codigo_turma ?? ""}${turma.nome_curso ? " · " + turma.nome_curso : ""}`;
  return {
    entidade: turma.executora ?? "QUINTA ARTE",
    local: turma.local_endereco ?? null,
    turma: ident,
    responsavelNome: extras.responsavelNome,
    responsavelCPF: extras.responsavelCPF,
    data: extras.data,
    horario: extras.horario,
  };
}

async function buscarCursistas(turmaId: string): Promise<CursistaEntrega[]> {
  const res = await supabase
    .from("matriculas")
    .select("beneficiaria:beneficiarias(nome, cpf), status")
    .eq("turma_id", turmaId);
  if (res.error) throw new Error(res.error.message);
  const raw = (res.data ?? []) as unknown as Array<{
    beneficiaria: unknown;
    status: string | null;
  }>;
  const rows = raw.map((r) => {
    const b = Array.isArray(r.beneficiaria) ? r.beneficiaria[0] : r.beneficiaria;
    const ben = (b ?? null) as { nome?: string | null; cpf?: string | null } | null;
    return { beneficiaria: ben, status: r.status };
  });
  return rows
    .filter((r) => {
      const s = String(r.status ?? "").toLowerCase();
      return (
        s === "" || ["inscrita", "matriculada", "cursando", "concluinte"].includes(s)
      );
    })
    .map((r) => ({
      nome: r.beneficiaria?.nome ?? "",
      cpf: r.beneficiaria?.cpf ?? null,
    }))
    .filter((c) => c.nome);
}