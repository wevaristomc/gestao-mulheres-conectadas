// Sugere beneficiárias a partir de ava_users (CPF válido, sem beneficiaria_id),
// e cria/vincula em lote quando a coordenação confirma a lista.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sugestao = {
  moodle_id: number;
  nome: string;
  cpf: string;
  email: string | null;
};

function limpaCpf(s: string | null | undefined): string | null {
  if (!s) return null;
  const only = String(s).replace(/\D/g, "");
  return only.length === 11 ? only : null;
}

async function assertCoordenador(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (a: string, b: string) => {
        eq: (a: string, b: string) => {
          limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> };
        };
      };
    };
  };
}, userId: string) {
  const roleQ = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "coordenador_geral")
    .limit(1)
    .maybeSingle();
  if (roleQ.error) throw new Error(roleQ.error.message);
  if (!roleQ.data) throw new Error("Apenas a coordenação geral pode executar esta operação.");
}

export const listarSugestoesBeneficiariasDoAva = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ sugestoes: Sugestao[] }> => {
    await assertCoordenador(context.supabase as never, context.userId);

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("ava_users")
      .select("moodle_id, firstname, lastname, email, cpf")
      .is("beneficiaria_id", null)
      .not("cpf", "is", null)
      .order("firstname", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);

    const sugestoes: Sugestao[] = [];
    for (const u of (data ?? []) as Array<{
      moodle_id: number;
      firstname: string | null;
      lastname: string | null;
      email: string | null;
      cpf: string | null;
    }>) {
      const cpf = limpaCpf(u.cpf);
      if (!cpf) continue;
      const nome = `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim();
      if (!nome) continue;
      sugestoes.push({ moodle_id: u.moodle_id, nome, cpf, email: u.email ?? null });
    }
    return { sugestoes };
  });

export const criarBeneficiariasDoAva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { moodle_ids: number[] }) => {
    if (!input || !Array.isArray(input.moodle_ids)) throw new Error("moodle_ids obrigatório.");
    return { moodle_ids: input.moodle_ids.filter((n) => Number.isFinite(n)) };
  })
  .handler(async ({ data, context }) => {
    await assertCoordenador(context.supabase as never, context.userId);

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    if (data.moodle_ids.length === 0) {
      return { criadas: 0, vinculadas: 0, ignoradas: 0 };
    }

    // Busca dados dos ava_users solicitados
    const usersQ = await admin
      .from("ava_users")
      .select("moodle_id, firstname, lastname, email, cpf, beneficiaria_id")
      .in("moodle_id", data.moodle_ids);
    if (usersQ.error) throw new Error(usersQ.error.message);

    // Beneficiárias existentes por CPF
    const cpfsSet = new Set<string>();
    const users = ((usersQ.data ?? []) as Array<{
      moodle_id: number;
      firstname: string | null;
      lastname: string | null;
      email: string | null;
      cpf: string | null;
      beneficiaria_id: string | null;
    }>).map((u) => ({ ...u, cpf: limpaCpf(u.cpf) }));

    for (const u of users) if (u.cpf) cpfsSet.add(u.cpf);
    const cpfs = Array.from(cpfsSet);

    const cpfToBenef = new Map<string, string>();
    if (cpfs.length > 0) {
      const benefQ = await admin
        .from("beneficiarias")
        .select("id, cpf")
        .in("cpf", cpfs);
      if (benefQ.error) throw new Error(benefQ.error.message);
      for (const b of (benefQ.data ?? []) as { id: string; cpf: string }[]) {
        if (b.cpf) cpfToBenef.set(b.cpf, b.id);
      }
    }

    // Cria as que faltam
    type NovaBenef = { nome: string; cpf: string; email: string | null; observacoes: string };
    const novas: NovaBenef[] = [];
    for (const u of users) {
      if (!u.cpf) continue;
      if (cpfToBenef.has(u.cpf)) continue;
      const nome = `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim();
      if (!nome) continue;
      novas.push({
        nome,
        cpf: u.cpf,
        email: u.email ?? null,
        observacoes: "Cadastro incompleto — origem AVA",
      });
    }

    let criadas = 0;
    for (let k = 0; k < novas.length; k += 500) {
      const slice = novas.slice(k, k + 500);
      const { data: inserted, error } = await admin
        .from("beneficiarias")
        .upsert(slice, { onConflict: "cpf", ignoreDuplicates: false })
        .select("id, cpf");
      if (error) throw new Error(error.message);
      for (const b of (inserted ?? []) as { id: string; cpf: string }[]) {
        if (b.cpf) cpfToBenef.set(b.cpf, b.id);
      }
      criadas += slice.length;
    }

    // Vincula ava_users → beneficiaria_id
    let vinculadas = 0;
    let ignoradas = 0;
    for (const u of users) {
      if (!u.cpf) { ignoradas += 1; continue; }
      const bid = cpfToBenef.get(u.cpf);
      if (!bid) { ignoradas += 1; continue; }
      if (u.beneficiaria_id === bid) continue;
      const { error } = await admin
        .from("ava_users")
        .update({ beneficiaria_id: bid })
        .eq("moodle_id", u.moodle_id);
      if (error) throw new Error(error.message);
      vinculadas += 1;
    }

    return { criadas, vinculadas, ignoradas };
  });