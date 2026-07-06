import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { importBeneficiariasBulk, type Beneficiaria } from "@/lib/mte-queries";
import { isValidCpf, onlyDigits } from "@/lib/cpf";

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

/** CSV esperado (header exato):
 * nome,cpf,data_nascimento,genero,raca,pcd,telefone,municipio
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === "," || c === ";") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v && v.trim().length > 0));
}

function parseBool(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "sim" || s === "yes" || s === "s";
}

export function BeneficiariasCsvImport({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Partial<Beneficiaria>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFile = async (f: File | null) => {
    setFile(f);
    setPreview([]);
    setErrors([]);
    if (!f) return;
    const text = await f.text();
    const table = parseCsv(text);
    if (!table.length) { setErrors(["CSV vazio"]); return; }
    const header = table[0].map((h) => h.trim().toLowerCase());
    const required = ["nome", "cpf"];
    for (const r of required) {
      if (!header.includes(r)) { setErrors([`Coluna obrigatória ausente: ${r}`]); return; }
    }
    const idx = (name: string) => header.indexOf(name);
    const rows: Partial<Beneficiaria>[] = [];
    const errs: string[] = [];
    for (let i = 1; i < table.length; i += 1) {
      const row = table[i];
      const cpf = onlyDigits(row[idx("cpf")] ?? "");
      const nome = (row[idx("nome")] ?? "").trim();
      if (!nome) { errs.push(`Linha ${i + 1}: nome vazio`); continue; }
      if (!isValidCpf(cpf)) { errs.push(`Linha ${i + 1}: CPF inválido (${cpf})`); continue; }
      rows.push({
        nome,
        cpf,
        data_nascimento: (row[idx("data_nascimento")] ?? "").trim() || null,
        genero: (row[idx("genero")] ?? "").trim() || null,
        raca: (row[idx("raca")] ?? "").trim() || null,
        pcd: idx("pcd") >= 0 ? parseBool(row[idx("pcd")]) : false,
        telefone: idx("telefone") >= 0 ? onlyDigits(row[idx("telefone")] ?? "") : null,
        municipio: (row[idx("municipio")] ?? "").trim() || null,
      });
    }
    setPreview(rows);
    setErrors(errs);
  };

  const mut = useMutation({
    mutationFn: async () => importBeneficiariasBulk(preview),
    onSuccess: (r) => {
      toast.success(`${r.inserted} beneficiárias importadas`);
      qc.invalidateQueries({ queryKey: ["mte", "beneficiarias"] });
      onOpenChange(false);
      setFile(null); setPreview([]); setErrors([]);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao importar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar beneficiárias (CSV)</DialogTitle>
          <DialogDescription>
            Colunas esperadas: <code>nome,cpf,data_nascimento,genero,raca,pcd,telefone,municipio</code>.
            Duplicatas por CPF são atualizadas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {file ? (
            <div className="text-xs text-muted-foreground">
              Arquivo: {file.name} · Linhas válidas: {preview.length}
              {errors.length ? ` · Erros: ${errors.length}` : ""}
            </div>
          ) : null}
          {errors.length ? (
            <div className="max-h-32 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
              {errors.length > 20 ? <div>… e mais {errors.length - 20} erros.</div> : null}
            </div>
          ) : null}
          {preview.length ? (
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
              {preview.slice(0, 10).map((r, i) => (
                <div key={i} className="truncate">
                  {i + 1}. {r.nome} — {r.cpf}
                </div>
              ))}
              {preview.length > 10 ? <div className="opacity-70">… e mais {preview.length - 10}.</div> : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!preview.length || mut.isPending}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importar {preview.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}