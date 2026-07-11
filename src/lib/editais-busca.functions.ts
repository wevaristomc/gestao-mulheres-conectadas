import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePapel, PAPEIS_COORDENACAO } from "@/lib/rbac-guard";
import { executarAiRouter } from "@/lib/ia.functions";

// -----------------------------------------------------------------------------
// Buscador Inteligente de Editais
// Consulta fontes públicas (PNCP, TransfereGov, Salic quando disponíveis),
// filtra por palavras-chave de interesse da Quinta Arte, e classifica cada
// novo edital via ai-router (processo "classificacao_edital" + "resumo_edital").
// -----------------------------------------------------------------------------

const PALAVRAS_CHAVE = [
  "social", "cultural", "cultura", "tecnologia", "tecnológico", "tecnologico",
  "educação", "educacao", "educacional", "capacitação", "capacitacao",
  "qualificação", "qualificacao", "reciclagem", "ambiental", "meio ambiente",
  "sustentabilidade", "mulheres", "osc", "terceiro setor",
];

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function temPalavraChave(texto: string): boolean {
  const n = normalizar(texto);
  return PALAVRAS_CHAVE.some((p) => n.includes(normalizar(p)));
}

function hashEdital(titulo: string, orgao: string): string {
  return createHash("md5").update(`${titulo.trim()}::${orgao.trim()}`.toLowerCase()).digest("hex");
}

// ---- Adapters de fonte ------------------------------------------------------

type EditalNormalizado = {
  titulo: string;
  orgao: string;
  esfera: string; // federal|estadual|municipal
  data_encerramento: string | null;
  url_edital: string | null;
  valor_total: number | null;
  fonte_id: string;
};

async function fetchPNCP(fonteId: string): Promise<EditalNormalizado[]> {
  // PNCP – API pública de contratações com propostas abertas
  const hoje = new Date();
  const em30dias = new Date(hoje);
  em30dias.setDate(hoje.getDate() + 30);
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  // Modalidade 6 = concurso, mas para pegar chamamentos públicos usamos 5 (chamada pública). PNCP não filtra por texto na origem.
  const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=${fmt(em30dias)}&codigoModalidadeContratacao=5&tamanhoPagina=50&pagina=1`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const body = await res.json();
    const items = (body?.data ?? []) as any[];
    const out: EditalNormalizado[] = [];
    for (const it of items) {
      const titulo = String(it?.objetoCompra ?? it?.objeto ?? "").trim();
      const orgao = String(it?.orgaoEntidade?.razaoSocial ?? it?.orgao ?? "").trim();
      if (!titulo || !orgao) continue;
      if (!temPalavraChave(`${titulo} ${orgao}`)) continue;
      out.push({
        titulo,
        orgao,
        esfera: "federal",
        data_encerramento: it?.dataEncerramentoProposta ?? null,
        url_edital: it?.linkSistemaOrigem ?? null,
        valor_total: typeof it?.valorTotalEstimado === "number" ? it.valorTotalEstimado : null,
        fonte_id: fonteId,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchGenericoJson(url: string, fonteId: string, esfera: string): Promise<EditalNormalizado[]> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const body = await res.json();
    const items = Array.isArray(body) ? body : (body?.data ?? body?.items ?? []);
    const out: EditalNormalizado[] = [];
    for (const it of (items as any[])) {
      const titulo = String(it?.titulo ?? it?.nome ?? it?.title ?? "").trim();
      const orgao = String(it?.orgao ?? it?.orgao_nome ?? it?.entidade ?? "").trim();
      if (!titulo) continue;
      if (!temPalavraChave(`${titulo} ${orgao}`)) continue;
      out.push({
        titulo,
        orgao: orgao || "—",
        esfera,
        data_encerramento: it?.data_encerramento ?? it?.data_fim ?? null,
        url_edital: it?.url ?? it?.link ?? null,
        valor_total: typeof it?.valor_total === "number" ? it.valor_total : null,
        fonte_id: fonteId,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchDeFonte(fonte: any): Promise<EditalNormalizado[]> {
  const nome = String(fonte?.nome ?? "").toLowerCase();
  if (nome.includes("pncp")) return fetchPNCP(fonte.id);
  if (fonte?.url_base && String(fonte.tipo ?? "").toLowerCase() === "api") {
    return fetchGenericoJson(String(fonte.url_base), fonte.id, String(fonte.esfera ?? "federal"));
  }
  return [];
}

// ---- Classificação / resumo IA ---------------------------------------------

function extrairJson(txt: string): Record<string, unknown> | null {
  const m = /\{[\s\S]*\}/.exec(txt);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function enriquecerComIA(admin: any, edital: EditalNormalizado): Promise<{ categoria: string | null; resumo_ia: string | null; aderencia: number | null }> {
  try {
    const classif = await executarAiRouter({
      admin,
      processo: "classificacao_edital",
      mensagens: [
        { role: "system", content: "Você classifica editais. Responda APENAS JSON: {\"categoria\":\"cultural|tecnologico|educacional|reciclagem|ambiental|social|outro\"}" },
        { role: "user", content: `Título: ${edital.titulo}\nÓrgão: ${edital.orgao}` },
      ],
    });
    const cat = extrairJson(classif.content);
    const categoria = typeof cat?.categoria === "string" ? String(cat.categoria).toLowerCase() : null;

    const resumo = await executarAiRouter({
      admin,
      processo: "resumo_edital",
      mensagens: [
        { role: "system", content: "Você avalia editais para a OSC Quinta Arte (Belo Horizonte/MG), que trabalha com qualificação profissional de mulheres em tecnologia, cultura e educação. Responda APENAS JSON: {\"resumo\":\"...máx 300 chars\",\"aderencia\":0-100}" },
        { role: "user", content: `Título: ${edital.titulo}\nÓrgão: ${edital.orgao}\nEsfera: ${edital.esfera}` },
      ],
    });
    const r = extrairJson(resumo.content);
    const resumoTxt = typeof r?.resumo === "string" ? String(r.resumo).slice(0, 500) : null;
    const ader = typeof r?.aderencia === "number" ? Math.max(0, Math.min(100, r.aderencia)) : null;

    return { categoria, resumo_ia: resumoTxt, aderencia: ader };
  } catch {
    return { categoria: null, resumo_ia: null, aderencia: null };
  }
}

// ---- Server functions -------------------------------------------------------

export const buscarEditais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input) => z.object({ projetoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    void context.userId;
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();

    // Cria registro de busca
    const { data: buscaRow, error: buscaErr } = await admin
      .from("editais_buscas")
      .insert({ status: "executando", iniciada_em: new Date().toISOString(), fontes_consultadas: 0, editais_novos: 0 })
      .select("id")
      .single();
    if (buscaErr) throw new Error(buscaErr.message);
    const buscaId = buscaRow.id as string;

    try {
      const { data: fontes } = await admin
        .from("editais_fontes")
        .select("*")
        .eq("ativo", true);
      const listaFontes = (fontes ?? []) as any[];

      let novos = 0;
      let consultadas = 0;

      for (const fonte of listaFontes) {
        consultadas += 1;
        const encontrados = await fetchDeFonte(fonte);
        for (const ed of encontrados) {
          const hash = hashEdital(ed.titulo, ed.orgao);
          const { data: existe } = await admin.from("editais").select("id").eq("hash_unico", hash).maybeSingle();
          if (existe) continue;

          const enriquecido = await enriquecerComIA(admin, ed);
          const payload: Record<string, unknown> = {
            titulo: ed.titulo,
            orgao: ed.orgao,
            esfera: ed.esfera,
            data_encerramento: ed.data_encerramento,
            url_edital: ed.url_edital,
            valor_total: ed.valor_total,
            valor_previsto: ed.valor_total,
            fonte_id: ed.fonte_id,
            hash_unico: hash,
            situacao: "novo",
            categoria: enriquecido.categoria,
            resumo_ia: enriquecido.resumo_ia,
            aderencia_score: enriquecido.aderencia,
            projeto_id: data.projetoId,
          };
          const { error: insErr } = await admin.from("editais").insert(payload);
          if (!insErr) novos += 1;
        }
      }

      await admin.from("editais_buscas").update({
        status: "concluida",
        finalizada_em: new Date().toISOString(),
        fontes_consultadas: consultadas,
        editais_novos: novos,
      }).eq("id", buscaId);

      return { ok: true, buscaId, fontesConsultadas: consultadas, editaisNovos: novos };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("editais_buscas").update({
        status: "erro",
        finalizada_em: new Date().toISOString(),
        erro: msg.slice(0, 500),
      }).eq("id", buscaId);
      throw new Error(msg);
    }
  });

export const ultimaBusca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("editais_buscas")
      .select("*")
      .order("iniciada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

export const atualizarSituacaoEdital = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePapel(PAPEIS_COORDENACAO)])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      situacao: z.enum(["novo", "analisando", "aderente", "descartado", "inscrito"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("editais").update({ situacao: data.situacao }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });