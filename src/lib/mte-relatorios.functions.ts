import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ViewInput = z.object({ view: z.enum([
  "vw_cronograma_execucao",
  "vw_cursos_executados",
  "vw_beneficiarias",
  "vw_consolidacao_turma",
  "vw_checklist_fiscalizacao",
  "vw_relacao_qualificados",
  "vw_indicadores_ciclo",
]) });

export const consultarViewMTE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ViewInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: rows, error } = await admin.from(data.view).select("*").limit(5000);
    if (error) return { rowsJson: "[]", error: error.message as string | null };
    return { rowsJson: JSON.stringify(rows ?? []), error: null as string | null };
  });

export const consultarExecucaoFisicoFinanceira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data: rubricas, error: e1 } = await admin.from("rubricas").select("*");
    if (e1) return { rowsJson: "[]", error: e1.message as string | null };
    const { data: despesas, error: e2 } = await admin
      .from("despesas")
      .select("rubrica_id, valor");
    if (e2) return { rowsJson: "[]", error: e2.message as string | null };
    const executado = new Map<string, number>();
    for (const d of despesas ?? []) {
      const rid = String((d as Record<string, unknown>).rubrica_id ?? "");
      if (!rid) continue;
      executado.set(rid, (executado.get(rid) ?? 0) + Number((d as Record<string, unknown>).valor ?? 0));
    }
    const rows = (rubricas ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      const prev = Number(rec.valor_previsto ?? 0);
      const exec = executado.get(String(rec.id)) ?? 0;
      return {
        codigo: rec.codigo ?? "",
        descricao: rec.descricao ?? "",
        valor_previsto: prev,
        valor_executado: exec,
        saldo: prev - exec,
        pct_execucao: prev > 0 ? Math.round((exec / prev) * 10000) / 100 : 0,
      };
    });
    return { rowsJson: JSON.stringify(rows), error: null as string | null };
  });