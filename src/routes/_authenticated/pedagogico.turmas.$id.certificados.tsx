import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Award, Download, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { carregarElegiveisCertificado, gerarLoteCertificados } from "@/lib/certificados.functions";
import { gerarCertificadoPDF, slugifyNome } from "@/lib/certificado-pdf";
import { turmaByIdOptions, pickFirst } from "@/lib/pedagogico-queries";
import {
  baixarBlob,
  gerarListaEntregaCertificadosPDF,
  type CursistaEntrega,
} from "@/lib/lista-entrega-gerador";

export const Route = createFileRoute("/_authenticated/pedagogico/turmas/$id/certificados")({
  component: CertificadosTab,
});

type MatriculaRow = {
  id: string;
  beneficiaria_id: string;
  status: string | null;
  frequencia_percentual: number | null;
  certificado_numero: string | null;
  certificado_emitido: boolean | null;
  beneficiarias?: { nome?: string; cpf?: string } | null;
};

function CertificadosTab() {
  const { id: turmaId } = Route.useParams();
  const qc = useQueryClient();
  const carregar = useServerFn(carregarElegiveisCertificado);
  const gerar = useServerFn(gerarLoteCertificados);
  const turmaQ = useQuery(turmaByIdOptions(turmaId));

  const [rows, setRows] = useState<MatriculaRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      setCarregando(true);
      try {
        const res = await carregar({ data: { turmaId } });
        if (cancel) return;
        if (res.error) setErro(res.error);
        setRows(JSON.parse(res.rowsJson || "[]"));
      } catch (e) {
        if (!cancel) setErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancel) setCarregando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [turmaId, carregar]);

  const elegiveis = useMemo(
    () =>
      rows.filter(
        (r) =>
          Number(r.frequencia_percentual ?? 0) >= 75 &&
          (r.status === "concluinte" || r.status === "cursando") &&
          !r.certificado_emitido,
      ),
    [rows],
  );

  const marcarTodos = (v: boolean) => {
    const s: Record<string, boolean> = {};
    for (const r of elegiveis) s[r.id] = v;
    setSel(s);
  };

  const selecionadas = elegiveis.filter((r) => sel[r.id]);

  const turma = turmaQ.data?.row;
  const cursoNome = pickFirst(turma, ["nome_curso", "nome", "titulo"]) ?? "Turma";
  const municipio = pickFirst(turma, ["municipio"]);
  const inicio = pickFirst(turma, ["data_inicio", "inicio"]);
  const fim = pickFirst(turma, ["data_fim", "fim"]);
  const periodo = inicio && fim ? `${formatBR(inicio)} a ${formatBR(fim)}` : null;
  const codigoTurma = (pickFirst(turma, ["codigo_turma"]) as string | null) ?? null;
  const localEndereco = pickFirst(turma, ["local_endereco", "local", "endereco"]);
  const executora = pickFirst(turma, ["executora"]) ?? "QUINTA ARTE";

  async function baixarListaEntregaCertificados() {
    const emitidos = rows.filter((r) => r.certificado_emitido);
    const base: MatriculaRow[] = emitidos.length > 0 ? emitidos : rows;
    const cursistas: CursistaEntrega[] = base
      .map((r) => ({
        nome: r.beneficiarias?.nome ?? "",
        cpf: r.beneficiarias?.cpf ?? null,
      }))
      .filter((c) => c.nome);
    if (cursistas.length === 0) {
      toast.error("Nenhum concluinte para listar.");
      return;
    }
    const ident = `${codigoTurma ?? ""}${cursoNome ? " · " + cursoNome : ""}`;
    const blob = await gerarListaEntregaCertificadosPDF({
      cabecalho: {
        entidade: executora as string,
        local: (localEndereco as string) ?? null,
        turma: ident,
        data: new Date().toISOString().slice(0, 10),
      },
      cursistas,
    });
    baixarBlob(
      blob,
      `lista-entrega-certificados_${slugifyNome(codigoTurma ?? cursoNome)}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  }

  const gerarLote = useMutation({
    mutationFn: async () => {
      if (!selecionadas.length) throw new Error("Selecione ao menos uma cursista.");
      const res = await gerar({
        data: { turmaId, matriculaIds: selecionadas.map((r) => r.id) },
      });
      // Monta ZIP client-side com um PDF por cursista + XLSX de lista de entrega.
      const zip = new JSZip();
      const listaAoA: (string | number)[][] = [
        ["Nome", "CPF", "Nº Certificado", "Data", "Assinatura"],
      ];
      for (const em of res.emitidos) {
        const m = selecionadas.find((r) => r.id === em.matriculaId);
        if (!m) continue;
        const nome = m.beneficiarias?.nome ?? "Cursista";
        const cpf = m.beneficiarias?.cpf ?? "";
        const blob = gerarCertificadoPDF({
          nome,
          cpf,
          turma: cursoNome,
          curso: cursoNome,
          projeto: "Programa Manuel Querino",
          dataConclusao: new Date(em.data),
          numero: em.numero,
          cargaHoraria: 150,
          municipio: municipio ?? undefined,
          periodo: periodo ?? undefined,
        });
        const buf = await blob.arrayBuffer();
        zip.file(`${em.numero}_${slugifyNome(nome)}.pdf`, buf);
        listaAoA.push([nome, cpf, em.numero, em.data, ""]);
      }
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(listaAoA);
      XLSX.utils.book_append_sheet(wb, ws, "Lista de Entrega");
      const xlsxBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      zip.file("lista-de-entrega.xlsx", xlsxBuf);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificados-${slugifyNome(cursoNome)}-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return res.emitidos.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} certificados emitidos.`);
      qc.invalidateQueries();
      // Recarrega para refletir emissões
      setSel({});
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Certificados</div>
          <div className="text-xs text-muted-foreground">
            Elegíveis: qualificadas, frequência ≥ 75% e certificado ainda não emitido.
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={baixarListaEntregaCertificados}
            disabled={rows.length === 0}
            className="gap-1.5"
          >
            <FileSignature className="h-4 w-4" /> Lista de entrega
          </Button>
          <Button
            onClick={() => gerarLote.mutate()}
            disabled={!selecionadas.length || gerarLote.isPending}
            className="gap-1.5"
          >
            {gerarLote.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Award className="h-4 w-4" />
            )}
            Gerar {selecionadas.length ? `(${selecionadas.length})` : ""}
          </Button>
        </div>
      </div>

      {erro ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 break-words">{erro}</div>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={elegiveis.length > 0 && selecionadas.length === elegiveis.length}
                  onCheckedChange={(c) => marcarTodos(Boolean(c))}
                />
              </TableHead>
              <TableHead>Cursista</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead className="text-right">Frequência</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="text-right">Nº Certificado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma matrícula nesta turma.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const freq = Number(r.frequencia_percentual ?? 0);
                const eleg =
                  freq >= 75 &&
                  (r.status === "concluinte" || r.status === "cursando") &&
                  !r.certificado_emitido;
                return (
                  <TableRow key={r.id} className={eleg ? "" : "opacity-60"}>
                    <TableCell>
                      {eleg ? (
                        <Checkbox
                          checked={!!sel[r.id]}
                          onCheckedChange={(c) => setSel((s) => ({ ...s, [r.id]: Boolean(c) }))}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>{r.beneficiarias?.nome ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.beneficiarias?.cpf ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{freq.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{r.status ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.certificado_numero ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatBR(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}
