import JSZip from "jszip";

import { supabase } from "@/integrations/supabase/client";
import { parseChat, type ParsedMensagem } from "@/lib/whatsapp-parser";

const BUCKET = "whatsapp";
// Padrão do Supabase Storage por objeto (ajustável no bucket). Mídias
// individuais do WhatsApp raramente ultrapassam isso; se passar, marcamos
// como pulada e seguimos.
const MAX_MIDIA_BYTES = 50 * 1024 * 1024;

export type MensagemPreparada = ParsedMensagem & {
  midia_path: string | null;
};

export type ProgressoImport = {
  fase: "lendo" | "parseando" | "upando_midias" | "upando_zip" | "salvando" | "concluido";
  midias_feitas: number;
  midias_total: number;
  midias_puladas: number;
  mensagem?: string;
};

export type ProcessarZipNoBrowserResult = {
  importacao_temp_id: string;
  arquivo_zip_path: string | null; // null se zip cru foi grande demais pra subir
  mensagens: MensagemPreparada[];
  periodo_inicio: string | null;
  periodo_fim: string | null;
  total_audios: number;
  total_imagens: number;
  total_videos: number;
  total_remetentes: number;
  midias_puladas: number;
};

function guessContentType(nome: string): string {
  const n = nome.toLowerCase();
  if (n.endsWith(".opus")) return "audio/ogg";
  if (n.endsWith(".ogg")) return "audio/ogg";
  if (n.endsWith(".m4a")) return "audio/mp4";
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

/**
 * Descompacta o zip do WhatsApp NO NAVEGADOR (JSZip lê Blobs em streaming,
 * aguenta 500 MB+), sobe cada mídia individualmente para o Storage e
 * devolve as mensagens já com `midia_path` pronto para o server function
 * registrar em lote. Contorna o limite de RAM/CPU do Worker.
 */
export async function processarZipNoBrowser(
  file: File,
  onProgress: (p: ProgressoImport) => void,
): Promise<ProcessarZipNoBrowserResult> {
  const tempId = crypto.randomUUID();
  onProgress({ fase: "lendo", midias_feitas: 0, midias_total: 0, midias_puladas: 0 });

  const zip = await JSZip.loadAsync(file);

  // Coleta entradas
  const mediaEntries: Record<string, JSZip.JSZipObject> = {};
  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const base = relPath.split("/").pop() ?? relPath;
    mediaEntries[base] = entry;
  });

  // Localiza _chat.txt
  onProgress({ fase: "parseando", midias_feitas: 0, midias_total: 0, midias_puladas: 0 });
  let chatText: string | null = null;
  const chatEntry = Object.entries(mediaEntries).find(([n]) => /^_?chat\.txt$/i.test(n));
  if (chatEntry) {
    chatText = await chatEntry[1].async("string");
  } else {
    const txts = Object.entries(mediaEntries).filter(([n]) => n.toLowerCase().endsWith(".txt"));
    let best: string | null = null;
    for (const [, e] of txts) {
      const s = await e.async("string");
      if (s.length > (best?.length ?? 0)) best = s;
    }
    chatText = best;
  }
  if (!chatText) throw new Error("_chat.txt não encontrado dentro do zip.");

  const parsed = parseChat(chatText);

  // Descobre mídias que serão upadas (apenas as citadas em mensagens)
  const midiasNecessarias = parsed.mensagens
    .map((m) => m.midia_nome)
    .filter((n): n is string => !!n && !!mediaEntries[n]);
  const midiasUnicas = Array.from(new Set(midiasNecessarias));

  let audios = 0, imagens = 0, videos = 0;
  const remetentes = new Set<string>();
  for (const m of parsed.mensagens) {
    if (m.tipo === "audio") audios++;
    if (m.tipo === "imagem") imagens++;
    if (m.tipo === "video") videos++;
    if (m.remetente_fone_e164) remetentes.add(m.remetente_fone_e164);
  }

  // Upload de mídias com progresso
  const midiaPathByNome = new Map<string, string>();
  let feitas = 0;
  let puladas = 0;
  onProgress({
    fase: "upando_midias",
    midias_feitas: 0,
    midias_total: midiasUnicas.length,
    midias_puladas: 0,
  });

  for (const nome of midiasUnicas) {
    const entry = mediaEntries[nome];
    try {
      const blob = await entry.async("blob");
      if (blob.size > MAX_MIDIA_BYTES) {
        puladas++;
      } else {
        const objectPath = `imports/${tempId}/media/${nome}`;
        const typed = new Blob([blob], { type: guessContentType(nome) });
        const up = await supabase.storage.from(BUCKET).upload(objectPath, typed, {
          upsert: true,
          contentType: guessContentType(nome),
        });
        if (!up.error) midiaPathByNome.set(nome, objectPath);
        else puladas++;
      }
    } catch {
      puladas++;
    }
    feitas++;
    if (feitas % 5 === 0 || feitas === midiasUnicas.length) {
      onProgress({
        fase: "upando_midias",
        midias_feitas: feitas,
        midias_total: midiasUnicas.length,
        midias_puladas: puladas,
        mensagem: nome,
      });
    }
  }

  // Sobe o zip cru só se couber no limite do bucket; caso contrário deixa null.
  let zipPath: string | null = null;
  if (file.size <= MAX_MIDIA_BYTES) {
    onProgress({
      fase: "upando_zip",
      midias_feitas: feitas,
      midias_total: midiasUnicas.length,
      midias_puladas: puladas,
    });
    const path = `imports/${tempId}/original.zip`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: "application/zip",
    });
    if (!up.error) zipPath = path;
  }

  const mensagens: MensagemPreparada[] = parsed.mensagens.map((m) => ({
    ...m,
    midia_path: m.midia_nome ? (midiaPathByNome.get(m.midia_nome) ?? null) : null,
  }));

  onProgress({
    fase: "salvando",
    midias_feitas: feitas,
    midias_total: midiasUnicas.length,
    midias_puladas: puladas,
  });

  return {
    importacao_temp_id: tempId,
    arquivo_zip_path: zipPath,
    mensagens,
    periodo_inicio: parsed.periodo_inicio,
    periodo_fim: parsed.periodo_fim,
    total_audios: audios,
    total_imagens: imagens,
    total_videos: videos,
    total_remetentes: remetentes.size,
    midias_puladas: puladas,
  };
}