import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { aulasMteListOptions, turmasMteListOptions, type AulaMTE, type TurmaMTE } from "@/lib/mte-queries";
import {
  baixarBlob, gerarListaDOCX, gerarListaPDF, gerarListaXLSX,
  type Cursista, type ListaData,
} from "@/lib/lista-presenca-gerador";

type Formato = "pdf" | "xlsx" | "docx";

export function DialogGerarListas({
  open, onOpenChange, turmaId: turmaIdProp,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  turmaId?: string;
}) {
  const turmasQ = useQuery(turmasMteListOptions());
  const turmas = turmasQ.data?.rows ?? [];
  const [turmaId, setTurmaId] = useState<string>(turmaIdProp ?? "");
  useEffect(() => { if (turmaIdProp) setTurmaId(turmaIdProp); }, [turmaIdProp]);

  const aulasQ = useQuery(aulasMteListOptions(turmaId || null));
  const aulas = useMemo(() => (aulasQ.data?.rows ?? []).slice().sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? ""))), [aulasQ.data]);

  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [extras, setExtras] = useState<number>(5);
  const [formato, setFormato] = useState<Formato>("pdf");
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const next: Record<string, boolean> = {};
    aulas.forEach((a) => { if ((a.data ?? "") >= hoje) next[a.id] = true; });
    setSel(next);
  }, [open, aulas]);

  const selCount = Object.values(sel).filter(Boolean).length;

  async function gerar() {
    const turma = turmas.find((t) => t.id === turmaId);
    if (!turma) { toast.error("Selecione uma turma."); return; }
    const aulasSelecionadas = aulas.filter((a) => sel[a.id]);
    if (aulasSelecionadas.length === 0) { toast.error("Selecione ao menos uma aula."); return; }

    setGerando(true);
    try {
      const cursistas = await buscarCursistas(turmaId);
      const listas: ListaData[] = aulasSelecionadas.map((a) => construirLista(turma, a, cursistas, extras));

      const codigo = (turma.codigo_turma ?? "turma").replace(/[^\w-]+/g, "-");
      const hoje = new Date().toISOString().slice(0, 10);
      let blob: Blob; let ext: string;
      if (formato === "pdf") { blob = gerarListaPDF(listas); ext = "pdf"; }
      else if (formato === "xlsx") { blob = await gerarListaXLSX(listas); ext = "xlsx"; }
      else { blob = await gerarListaDOCX(listas); ext = "docx"; }
      baixarBlob(blob, `listas-presenca_${codigo}_${hoje}.${ext}`);
      toast.success(`${aulasSelecionadas.length} folha(s) gerada(s).`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar listas");
    } finally {
      setGerando(false);
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!gerando) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar listas de presença</DialogTitle>
          <DialogDescription>
            Uma folha por aula, pré-preenchida com as cursistas matriculadas.
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
                <option key={t.id} value={t.id}>{t.codigo_turma ?? "—"} · {t.nome_curso ?? "Turma"}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Aulas ({selCount} selecionadas)</Label>
            <div className="flex gap-1 text-xs">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSel(Object.fromEntries(aulas.map((a) => [a.id, true])))}>Todas</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSel({})}>Nenhuma</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSel(Object.fromEntries(aulas.filter((a) => (a.data ?? "") >= hoje).map((a) => [a.id, true])))}>Só futuras</Button>
            </div>
          </div>
          <ScrollArea className="h-56 rounded-md border">
            {aulasQ.isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">Carregando aulas…</div>
            ) : aulas.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhuma aula cadastrada para esta turma.</div>
            ) : (
              <ul className="divide-y">
                {aulas.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox checked={!!sel[a.id]} onCheckedChange={(v) => setSel((s) => ({ ...s, [a.id]: !!v }))} />
                    <span className="w-24 shrink-0 tabular-nums">{formatarData(a.data)}</span>
                    <span className="flex-1 truncate">{a.conteudo_programatico ?? "(sem tema)"}</span>
                    <span className="text-xs text-muted-foreground">{a.ch_prevista ?? "—"}h</span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="extras">Linhas em branco extras</Label>
            <Input id="extras" type="number" min={0} max={30} value={extras} onChange={(e) => setExtras(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
          </div>
          <div className="space-y-1.5">
            <Label>Formato</Label>
            <RadioGroup value={formato} onValueChange={(v) => setFormato(v as Formato)} className="flex gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="pdf" /><FileText className="h-4 w-4" /> PDF</label>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="xlsx" /><FileSpreadsheet className="h-4 w-4" /> XLSX</label>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="docx" /><FileText className="h-4 w-4" /> DOCX</label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={gerando}>Cancelar</Button>
          <Button onClick={gerar} disabled={gerando || !turmaId || selCount === 0}>
            {gerando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Gerar {selCount > 0 ? `(${selCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

async function buscarCursistas(turmaId: string): Promise<Cursista[]> {
  const res = await supabase
    .from("matriculas")
    .select("beneficiaria:beneficiarias(nome, cpf), status")
    .eq("turma_id", turmaId);
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data ?? []) as Array<{ beneficiaria: { nome: string; cpf: string | null } | null; status: string | null }>;
  const ativas = rows.filter((r) => {
    const s = String(r.status ?? "").toLowerCase();
    return s === "" || ["inscrita", "matriculada", "cursando", "concluinte"].includes(s);
  });
  return ativas
    .map((r) => ({ nome: r.beneficiaria?.nome ?? "—", cpf: r.beneficiaria?.cpf ?? null }))
    .filter((c) => c.nome && c.nome !== "—");
}

function construirLista(turma: TurmaMTE, aula: AulaMTE, cursistas: Cursista[], extras: number): ListaData {
  return {
    turma: {
      codigo: turma.codigo_turma,
      nomeCurso: turma.nome_curso,
      municipio: turma.municipio,
      turno: turma.turno,
      local: turma.local_endereco,
    },
    aula: {
      data: aula.data,
      tema: aula.conteudo_programatico,
      cargaHoraria: aula.ch_prevista ? `${aula.ch_prevista}h` : null,
      instrutor: aula.instrutor,
    },
    cursistas,
    extras,
  };
}