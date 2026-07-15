import { supabase } from "@/integrations/supabase/client";
import type { CabecalhoExtraido, LinhaConferencia } from "@/lib/leitor-lista";

// -----------------------------------------------------------------------------
// Confronto forte com o sistema — checagens executadas ANTES da confirmação.
// Nunca grava nada; só devolve avisos e o diff com presencas manuais existentes.
// -----------------------------------------------------------------------------

export type NivelAviso = "info" | "atencao" | "bloqueante";

export type AvisoConfronto = {
  nivel: NivelAviso;
  chave: string;
  mensagem: string;
  detalhe?: string | null;
  link?: string | null; // ex.: ?importacao=<id> quando duplicado
};

export type ConflitoLinha = {
  matricula_id: string;
  nome: string;
  atual: boolean;
  sugerido: boolean;
};

export type ResultadoConfronto = {
  avisos: AvisoConfronto[];
  conflitos: ConflitoLinha[];
  aula_id_encontrada: string | null;
};

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similar(a: string, b: string): number {
  const A = norm(a).split(" ").filter(Boolean);
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.length || !B.size) return 0;
  let hits = 0;
  for (const p of A) if (B.has(p)) hits += 1;
  return hits / Math.max(A.length, B.size);
}

export async function confrontarComSistema(input: {
  turmaId: string;
  turma: { codigo_turma: string | null; nome_curso: string | null; professor_nome?: string | null };
  cabecalho: CabecalhoExtraido;
  linhas: LinhaConferencia[];
  arquivoHash?: string | null;
}): Promise<ResultadoConfronto> {
  const avisos: AvisoConfronto[] = [];

  // 1. Turma lida vs turma selecionada
  const turmaLida = norm(String(input.cabecalho.turma ?? "").replace(/^turma[:\s]*/i, ""));
  const codigo = norm(input.turma.codigo_turma ?? "");
  const curso = norm(input.turma.nome_curso ?? "");
  if (turmaLida && codigo) {
    const okCodigo = turmaLida.includes(codigo) || codigo.includes(turmaLida);
    const okCurso = curso && similar(turmaLida, curso) >= 0.5;
    if (!okCodigo && !okCurso) {
      avisos.push({
        nivel: "bloqueante",
        chave: "turma_divergente",
        mensagem: "A turma escrita na lista NÃO bate com a turma selecionada.",
        detalhe: `Lida: "${input.cabecalho.turma}" · Selecionada: ${input.turma.codigo_turma ?? "—"} — ${input.turma.nome_curso ?? "—"}`,
      });
    }
  }

  // 2. Data — precisa bater com uma aula existente OU (aviso não bloqueante) com o cronograma
  let aulaId: string | null = null;
  if (input.cabecalho.data) {
    const { data: aulas } = await supabase
      .from("aulas")
      .select("id, data")
      .eq("turma_id", input.turmaId)
      .eq("data", input.cabecalho.data)
      .limit(1);
    if (aulas && aulas.length) {
      aulaId = (aulas[0] as any).id as string;
    } else {
      avisos.push({
        nivel: "atencao",
        chave: "aula_inexistente",
        mensagem: `Não existe aula cadastrada em ${input.cabecalho.data} para esta turma.`,
        detalhe: "Ao confirmar, a aula será criada com esta data.",
      });
    }
  } else {
    avisos.push({
      nivel: "bloqueante",
      chave: "sem_data",
      mensagem: "A IA não identificou a data da aula. Preencha antes de confirmar.",
    });
  }

  // 3. Professor lido vs professor da turma
  const profLido = String(input.cabecalho.instrutor ?? "").trim();
  const profTurma = String(input.turma.professor_nome ?? "").trim();
  if (profLido && profTurma && similar(profLido, profTurma) < 0.7) {
    avisos.push({
      nivel: "atencao",
      chave: "professor_divergente",
      mensagem: "Instrutor lido difere do cadastrado na turma.",
      detalhe: `Lido: "${profLido}" · Cadastro: "${profTurma}"`,
    });
  }

  // 4. Duplicidade por hash
  if (input.arquivoHash) {
    const dup = await supabase
      .from("importacoes_presenca")
      .select("id, criado_em, status_sugestao, data_aula")
      .eq("arquivo_hash", input.arquivoHash)
      .neq("status_sugestao", "rejeitada")
      .order("criado_em", { ascending: false })
      .limit(1);
    const row = dup.data && dup.data[0] ? (dup.data[0] as any) : null;
    if (row) {
      const quando = row.criado_em
        ? new Date(row.criado_em).toLocaleDateString("pt-BR")
        : "data desconhecida";
      avisos.push({
        nivel: "bloqueante",
        chave: "duplicado",
        mensagem: `Este PDF já foi importado em ${quando}.`,
        detalhe: `Status atual: ${row.status_sugestao}. Rejeite a sugestão anterior antes de reimportar.`,
        link: row.id,
      });
    }
  }

  // 5. Conflito com lançamentos manuais existentes
  const conflitos: ConflitoLinha[] = [];
  if (aulaId) {
    const { data: atuais } = await supabase
      .from("presencas")
      .select("matricula_id, presente")
      .eq("aula_id", aulaId);
    const mapa = new Map<string, boolean>();
    for (const r of (atuais ?? []) as Array<{ matricula_id: string; presente: boolean }>) {
      mapa.set(r.matricula_id, !!r.presente);
    }
    if (mapa.size) {
      for (const l of input.linhas) {
        if (!l.matricula_id) continue;
        const at = mapa.get(l.matricula_id);
        if (at !== undefined && at !== !!l.presente) {
          conflitos.push({
            matricula_id: l.matricula_id,
            nome: l.nome_matriculado ?? l.nome ?? "—",
            atual: at,
            sugerido: !!l.presente,
          });
        }
      }
      if (conflitos.length) {
        avisos.push({
          nivel: "atencao",
          chave: "conflito_manual",
          mensagem: `${conflitos.length} linha(s) diferem do lançamento manual atual.`,
          detalhe: "Decida por linha (manter atual ou usar o valor sugerido) antes de confirmar.",
        });
      }
    }
  }

  return { avisos, conflitos, aula_id_encontrada: aulaId };
}

// Merge das correções da 2ª passada de verificação no resultado da 1ª.
export type CorrecaoVerificacao = {
  num_linha?: number | null;
  frequencia_sim?: boolean | null;
  lanche_sim?: boolean | null;
  assinatura_presente?: boolean | null;
  confianca?: number | null;
  motivo?: string | null;
};

export function aplicarVerificacao(
  linhas: LinhaConferencia[],
  correcoes: CorrecaoVerificacao[],
  totalContado: number | null,
  quantidadeManuscrita: number | null,
): { linhas: LinhaConferencia[]; avisos: string[] } {
  const porNum = new Map<number, CorrecaoVerificacao>();
  for (const c of correcoes) {
    if (c && typeof c.num_linha === "number") porNum.set(c.num_linha, c);
  }
  const atualizadas = linhas.map((l) => {
    const num = l.num ?? -1;
    const c = porNum.get(num);
    if (!c) return l;
    const patch: Partial<LinhaConferencia> = {};
    if (typeof c.frequencia_sim === "boolean") patch.frequencia_sim = c.frequencia_sim;
    if (typeof c.lanche_sim === "boolean") patch.lanche_sim = c.lanche_sim;
    if (typeof c.assinatura_presente === "boolean") patch.assinatura_presente = c.assinatura_presente;
    // valor final de "presente" segue frequencia_sim || assinatura_presente
    const freq = patch.frequencia_sim ?? l.frequencia_sim;
    const ass = patch.assinatura_presente ?? l.assinatura_presente;
    patch.presente = !!(freq || ass);
    const conf = typeof c.confianca === "number" ? c.confianca : Math.min(0.55, l.confianca ?? 0.55);
    patch.confianca = Math.max(0, Math.min(1, conf));
    patch.flag = "verificar";
    if (c.motivo) patch.motivo = c.motivo;
    return { ...l, ...patch };
  });

  const avisos: string[] = [];
  const totalMarcado = atualizadas.filter((l) => l.presente && l.matricula_id).length;
  if (typeof totalContado === "number" && totalContado !== totalMarcado) {
    avisos.push(`Divergência de contagem: ${totalMarcado} marcado(s) na tabela vs ${totalContado} conferido(s) pela 2ª passada.`);
  }
  if (typeof quantidadeManuscrita === "number" && quantidadeManuscrita !== totalMarcado) {
    avisos.push(`Divergência com o total manuscrito no rodapé: tabela indica ${totalMarcado}, manuscrito diz ${quantidadeManuscrita}.`);
  }
  return { linhas: atualizadas, avisos };
}

export function confiancaMedia(linhas: LinhaConferencia[]): number | null {
  const usar = linhas.filter((l) => l.matricula_id && typeof l.confianca === "number");
  if (!usar.length) return null;
  const s = usar.reduce((acc, l) => acc + (l.confianca ?? 0), 0);
  return Math.round((s / usar.length) * 1000) / 1000;
}