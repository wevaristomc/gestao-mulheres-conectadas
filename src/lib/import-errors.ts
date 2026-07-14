// Coletor de erros de importação com contexto (linha/registro/valor/motivo).
// Padrão único para importadores: consolidado QAJBC, Moodle, leitor de listas
// IA e CSVs. Auditoria P6 — nunca mais falha silenciosa; toda linha
// problemática é acumulada e apresentada ao final.

export type ImportError = {
  linha: number | string | null;
  registro?: string | null;
  valor?: string | null;
  motivo: string;
};

export class ImportErrorCollector {
  private erros: ImportError[] = [];
  private avisos: ImportError[] = [];

  addErro(e: ImportError): void {
    this.erros.push({ ...e, motivo: String(e.motivo ?? "").trim() || "erro" });
  }
  addAviso(e: ImportError): void {
    this.avisos.push({ ...e, motivo: String(e.motivo ?? "").trim() || "aviso" });
  }
  temErros(): boolean {
    return this.erros.length > 0;
  }
  erroCount(): number {
    return this.erros.length;
  }
  avisoCount(): number {
    return this.avisos.length;
  }
  listaErros(): ImportError[] {
    return this.erros.slice();
  }
  listaAvisos(): ImportError[] {
    return this.avisos.slice();
  }
  resumo(): string {
    const linhas: string[] = [];
    if (this.erros.length) {
      linhas.push(`❌ ${this.erros.length} erro(s):`);
      for (const e of this.erros) {
        const ctx = [e.linha != null ? `linha ${e.linha}` : null, e.registro].filter(Boolean).join(" · ");
        linhas.push(`  - ${ctx || "sem contexto"} → ${e.motivo}${e.valor ? ` (valor: ${e.valor})` : ""}`);
      }
    }
    if (this.avisos.length) {
      if (linhas.length) linhas.push("");
      linhas.push(`⚠ ${this.avisos.length} aviso(s):`);
      for (const w of this.avisos) {
        const ctx = [w.linha != null ? `linha ${w.linha}` : null, w.registro].filter(Boolean).join(" · ");
        linhas.push(`  - ${ctx || "sem contexto"} → ${w.motivo}${w.valor ? ` (valor: ${w.valor})` : ""}`);
      }
    }
    return linhas.join("\n");
  }
}