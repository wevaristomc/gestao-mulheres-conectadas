import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ViewInput = z.object({ view: z.enum([
  "vw_cronograma_execucao",
  "vw_cursos_executados",
  "vw_beneficiarias",
  "vw_consolidacao_turma",
  "vw_checklist_fiscalizacao",
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
