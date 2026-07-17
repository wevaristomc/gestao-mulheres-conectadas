import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO } from "@/lib/rbac-guard";

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
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const matriculaIds = [...new Set(data.matriculaIds)];

    const [matriculasRes, qualificacoesRes] = await Promise.all([
      admin.from("matriculas").select("id").eq("turma_id", data.turmaId).in("id", matriculaIds),
      admin
        .from("qualificados")
        .select("matricula_id, certificado_emitido")
        .in("matricula_id", matriculaIds),
    ]);
    if (matriculasRes.error) {
      throw new Error(`Falha ao validar matrículas: ${matriculasRes.error.message}`);
    }
    if (qualificacoesRes.error) {
      throw new Error(`Falha ao validar qualificações: ${qualificacoesRes.error.message}`);
    }

    const idsDaTurma = new Set((matriculasRes.data ?? []).map((row) => row.id as string));
    if (matriculaIds.some((id) => !idsDaTurma.has(id))) {
      throw new Error("Uma ou mais matrículas não pertencem à turma informada.");
    }
    const qualificacaoPorMatricula = new Map(
      (qualificacoesRes.data ?? []).map((row) => [row.matricula_id as string, row]),
    );
    if (matriculaIds.some((id) => !qualificacaoPorMatricula.has(id))) {
      throw new Error("Somente matrículas qualificadas podem receber certificado.");
    }
    if (matriculaIds.some((id) => qualificacaoPorMatricula.get(id)?.certificado_emitido === true)) {
      throw new Error("Uma ou mais matrículas já possuem certificado emitido.");
    }

    const { data: numsRaw, error: eNums } = await admin.rpc("proximo_numero_certificado", {
      qtd: matriculaIds.length,
    });
    if (eNums) throw new Error(`Falha ao reservar números: ${eNums.message}`);
    const nums = ((numsRaw as unknown as Array<unknown>) ?? []).map((n) => String(n));
    if (nums.length !== matriculaIds.length) {
      throw new Error("RPC proximo_numero_certificado devolveu tamanho inválido.");
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const emitidos: CertificadoEmitido[] = [];
    const { data: lote, error: eLote } = await admin
      .from("certificados_lotes")
      .insert({
        turma_id: data.turmaId,
        emitido_por: context.userId,
        quantidade: matriculaIds.length,
      })
      .select("id")
      .maybeSingle();
    if (eLote) console.warn("certificados_lotes insert warn:", eLote.message);

    for (let i = 0; i < matriculaIds.length; i++) {
      const matriculaId = matriculaIds[i];
      const numero = nums[i];
      const patch: Record<string, unknown> = {
        certificado_numero: numero,
        certificado_data: hoje,
        certificado_emitido: true,
      };
      if (lote?.id) patch.certificado_lote_id = lote.id;
      const { error } = await admin.from("matriculas").update(patch).eq("id", matriculaId);
      if (error) throw new Error(`Matrícula ${matriculaId}: ${error.message}`);

      const { error: eQualificacao } = await admin
        .from("qualificados")
        .update({
          certificado_emitido: true,
          certificado_emitido_em: new Date().toISOString(),
        })
        .eq("matricula_id", matriculaId);
      if (eQualificacao) {
        throw new Error(`Qualificação ${matriculaId}: ${eQualificacao.message}`);
      }
      emitidos.push({ matriculaId, numero, data: hoje });
    }

    return { loteId: lote?.id ?? null, emitidos };
  });

const CarregarInput = z.object({ turmaId: z.string().uuid() });

export const carregarElegiveisCertificado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((i) => CarregarInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("matriculas")
      .select(
        "id, beneficiaria_id, status, frequencia_percentual, certificado_numero, certificado_emitido, beneficiarias(nome, cpf)",
      )
      .eq("turma_id", data.turmaId);
    if (error) return { rowsJson: "[]", error: error.message };
    const matriculas = rows ?? [];
    const ids = matriculas.map((row) => row.id as string);
    if (!ids.length) return { rowsJson: "[]", error: null as string | null };

    const { data: qualificacoes, error: erroQualificacoes } = await context.supabase
      .from("qualificados")
      .select("matricula_id, certificado_emitido")
      .in("matricula_id", ids);
    if (erroQualificacoes) {
      return { rowsJson: "[]", error: erroQualificacoes.message };
    }
    const qualificacaoPorMatricula = new Map(
      (qualificacoes ?? []).map((row) => [row.matricula_id as string, row]),
    );
    const qualificadas = matriculas
      .filter((row) => qualificacaoPorMatricula.has(row.id as string))
      .map((row) => ({
        ...row,
        certificado_emitido:
          qualificacaoPorMatricula.get(row.id as string)?.certificado_emitido === true,
      }));
    return { rowsJson: JSON.stringify(qualificadas), error: null as string | null };
  });
