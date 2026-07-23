/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAPEIS_COORDENACAO, requirePapel } from "@/lib/rbac-guard";

const UUID = z.string().uuid();

export const criarPastaDriveCursista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input: unknown) => z.object({ cursistaId: UUID }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sincronizarDocumentosCursistaNoDrive } = await import("@/lib/cursista-drive.server");
    const admin: any = getSupabaseAdmin();

    const { data: cursista, error } = await admin
      .from("cursistas")
      .select("id, nome, cpf, pasta_drive_id, pasta_drive_url")
      .eq("id", data.cursistaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cursista) throw new Error("Cursista não encontrada.");
    return sincronizarDocumentosCursistaNoDrive({
      admin,
      cursistaId: cursista.id as string,
      force: true,
    });
  });
