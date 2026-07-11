import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO_E_FINANCEIRO } from "@/lib/rbac-guard";

const Input = z.object({
  turmaId: z.string().uuid(),
  matriculaIds: z.array(z.string().uuid()).min(1),
});

export type CertificadoEmitido = {
  matriculaId: string;
  numero: string;
  data: string;
};

export const gerarLoteCertificados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // Reserva números via RPC criada pelo usuário.
    const { data: numsRaw, error: eNums } = await admin.rpc("proximo_numero_certificado", {
      qtd: data.matriculaIds.length,
    });
    if (eNums) throw new Error(`Falha ao reservar números: ${eNums.message}`);
    const nums = ((numsRaw as unknown as Array<unknown>) ?? []).map((n) => String(n));
    if (nums.length !== data.matriculaIds.length) {
      throw new Error("RPC proximo_numero_certificado devolveu tamanho inválido.");
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const emitidos: CertificadoEmitido[] = [];

    // Cria lote
    const { data: lote, error: eLote } = await admin
      .from("certificados_lotes")
      .insert({
        turma_id: data.turmaId,
        emitido_por: context.userId,
        quantidade: data.matriculaIds.length,
      })
      .select("id")
      .maybeSingle();
    if (eLote) {
      // Não bloqueia — apenas loga; alguns schemas podem ter colunas diferentes.
      console.warn("certificados_lotes insert warn:", eLote.message);
    }

    for (let i = 0; i < data.matriculaIds.length; i++) {
      const matriculaId = data.matriculaIds[i];
      const numero = nums[i];
      const patch: Record<string, unknown> = {
        certificado_numero: numero,
        certificado_data: hoje,
        certificado_emitido: true,
      };
      if (lote?.id) patch.certificado_lote_id = lote.id;
      const { error } = await admin.from("matriculas").update(patch).eq("id", matriculaId);
      if (error) throw new Error(`Matrícula ${matriculaId}: ${error.message}`);
      emitidos.push({ matriculaId, numero, data: hoje });
    }

    return { loteId: lote?.id ?? null, emitidos };
  });

const CarregarInput = z.object({ turmaId: z.string().uuid() });

export const carregarElegiveisCertificado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO_E_FINANCEIRO)])
  .inputValidator((i) => CarregarInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("matriculas")
      .select("id, beneficiaria_id, status, frequencia_percentual, certificado_numero, certificado_emitido, beneficiarias(nome, cpf)")
      .eq("turma_id", data.turmaId);
    if (error) return { rowsJson: "[]", error: error.message };
    return { rowsJson: JSON.stringify(rows ?? []), error: null as string | null };
  });