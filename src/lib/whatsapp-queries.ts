import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WaGrupo = {
  id: string;
  nome: string;
  projeto_id: string | null;
  turma_id: string | null;
  observacoes: string | null;
  created_at?: string;
};

export type WaImportacao = {
  id: string;
  grupo_id: string;
  arquivo_zip_nome: string | null;
  arquivo_zip_path: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  status: string;
  total_mensagens: number | null;
  total_audios: number | null;
  total_imagens: number | null;
  total_videos: number | null;
  total_remetentes: number | null;
  created_at?: string;
};

export type WaMensagem = {
  id: string;
  importacao_id: string;
  grupo_id: string;
  timestamp: string;
  remetente_nome: string | null;
  remetente_fone_e164: string | null;
  beneficiaria_id: string | null;
  tipo: string;
  conteudo_texto: string | null;
  midia_path: string | null;
  midia_nome: string | null;
};

export type WaMidiaAnalise = {
  id: string;
  mensagem_id: string;
  tipo_analise: string;
  transcricao: string | null;
  ocr_texto: string | null;
  descricao_ia: string | null;
  tipo_provavel: string | null;
  erro: string | null;
};

export function gruposOptions() {
  return queryOptions({
    queryKey: ["wa", "grupos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_grupos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as WaGrupo[] };
    },
  });
}

export function importacoesGrupoOptions(grupoId: string | null) {
  return queryOptions({
    queryKey: ["wa", "importacoes", grupoId],
    enabled: !!grupoId,
    queryFn: async () => {
      if (!grupoId) return { rows: [] as WaImportacao[] };
      const { data, error } = await supabase
        .from("wa_importacoes")
        .select("*")
        .eq("grupo_id", grupoId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as WaImportacao[] };
    },
  });
}

export function importacaoOptions(importacaoId: string | null) {
  return queryOptions({
    queryKey: ["wa", "importacao", importacaoId],
    enabled: !!importacaoId,
    queryFn: async () => {
      if (!importacaoId) return null;
      const { data, error } = await supabase
        .from("wa_importacoes")
        .select("*")
        .eq("id", importacaoId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as WaImportacao | null;
    },
  });
}

export function mensagensOptions(importacaoId: string | null, limit = 300) {
  return queryOptions({
    queryKey: ["wa", "mensagens", importacaoId, limit],
    enabled: !!importacaoId,
    queryFn: async () => {
      if (!importacaoId) return { rows: [] as WaMensagem[] };
      const { data, error } = await supabase
        .from("wa_mensagens")
        .select("*")
        .eq("importacao_id", importacaoId)
        .order("timestamp", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as WaMensagem[] };
    },
  });
}

export function midiaAnalisesOptions(importacaoId: string | null) {
  return queryOptions({
    queryKey: ["wa", "midia-analises", importacaoId],
    enabled: !!importacaoId,
    queryFn: async () => {
      if (!importacaoId) return { rows: [] as WaMidiaAnalise[] };
      // join via mensagens
      const { data: msgs } = await supabase
        .from("wa_mensagens")
        .select("id")
        .eq("importacao_id", importacaoId);
      const ids = (msgs ?? []).map((m: { id: string }) => m.id);
      if (!ids.length) return { rows: [] };
      const { data, error } = await supabase
        .from("wa_midias_analise")
        .select("*")
        .in("mensagem_id", ids);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as WaMidiaAnalise[] };
    },
  });
}

export function resumosGrupoOptions(grupoId: string | null) {
  return queryOptions({
    queryKey: ["wa", "resumos", grupoId],
    enabled: !!grupoId,
    queryFn: async () => {
      if (!grupoId) return { rows: [] };
      const { data, error } = await supabase
        .from("wa_resumos")
        .select("*")
        .eq("grupo_id", grupoId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { rows: data ?? [] };
    },
  });
}