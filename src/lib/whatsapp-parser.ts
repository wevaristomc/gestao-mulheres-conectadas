import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Parser tolerante do `_chat.txt` exportado pelo WhatsApp (iOS/Android, PT-BR).
 * Retorna mensagens estruturadas + índice de anexos citados.
 */

export type MediaKind = "audio" | "imagem" | "video" | "doc" | null;

export type ParsedMensagem = {
  timestamp: string; // ISO
  remetente_nome: string | null;
  remetente_fone_e164: string | null;
  tipo: "texto" | "audio" | "imagem" | "video" | "doc" | "sistema";
  conteudo_texto: string | null;
  midia_nome: string | null; // nome do arquivo referenciado no zip, se houver
};

export type ParseResult = {
  mensagens: ParsedMensagem[];
  periodo_inicio: string | null;
  periodo_fim: string | null;
};

// Formatos comuns:
//   [08/03/24, 14:32:15] Fulano: mensagem  (iOS)
//   08/03/2024 14:32 - Fulano: mensagem     (Android PT-BR)
//   08/03/2024, 14:32 - Fulano: mensagem
const RE_IOS = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s+([^:]+?):\s?(.*)$/;
const RE_AND = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+-\s+([^:]+?):\s?(.*)$/;
const RE_SIS = /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s+-?\s*(.+)$/;

// Marcadores de mídia (pt/en). "<anexado: FILE>" / "<attached: FILE>" / "IMG-...opus (arquivo anexado)"
const RE_ATTACH_BRACKET = /<(?:anexado|attached):\s*([^>]+)>/i;
const RE_ATTACH_PARENS = /([^\s]+)\s+\((?:arquivo\s+anexado|file\s+attached)\)/i;

function pad(n: number) { return n < 10 ? `0${n}` : String(n); }

function toIso(d: number, m: number, y: number, hh: number, mm: number, ss: number): string {
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}-03:00`;
}

function classifyMedia(nome: string): MediaKind {
  const n = nome.toLowerCase();
  if (/\.(opus|ogg|m4a|mp3|aac|wav|amr)$/.test(n)) return "audio";
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/.test(n)) return "imagem";
  if (/\.(mp4|mov|3gp|mkv|avi|webm)$/.test(n)) return "video";
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip)$/.test(n)) return "doc";
  return null;
}

function detectAttachment(body: string): { nome: string | null; rest: string } {
  const m1 = body.match(RE_ATTACH_BRACKET);
  if (m1) return { nome: m1[1].trim(), rest: body.replace(m1[0], "").trim() };
  const m2 = body.match(RE_ATTACH_PARENS);
  if (m2) return { nome: m2[1].trim(), rest: body.replace(m2[0], "").trim() };
  return { nome: null, rest: body };
}

function tryHeader(line: string):
  | { ts: string; sender: string | null; rest: string; system: boolean }
  | null {
  let m = line.match(RE_IOS);
  if (m) {
    return {
      ts: toIso(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0),
      sender: m[7].trim(),
      rest: m[8] ?? "",
      system: false,
    };
  }
  m = line.match(RE_AND);
  if (m) {
    return {
      ts: toIso(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0),
      sender: m[7].trim(),
      rest: m[8] ?? "",
      system: false,
    };
  }
  m = line.match(RE_SIS);
  if (m) {
    return {
      ts: toIso(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0),
      sender: null,
      rest: m[7] ?? "",
      system: true,
    };
  }
  return null;
}

/** Extrai E.164 (BR default) do nome exibido, se ele parecer um telefone. */
export function foneFromSender(sender: string | null): string | null {
  if (!sender) return null;
  // WhatsApp costuma mostrar "+55 31 9 8888-7777" ou variantes.
  const cleaned = sender.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  try {
    const p = parsePhoneNumberFromString(cleaned, "BR");
    if (p && p.isValid()) return p.number; // E.164
  } catch {
    /* noop */
  }
  // fallback: só dígitos, pelo menos 10 (BR sem código)
  const digits = sender.replace(/\D/g, "");
  if (digits.length >= 10) {
    try {
      const p = parsePhoneNumberFromString(`+${digits.startsWith("55") ? digits : "55" + digits}`);
      if (p && p.isValid()) return p.number;
    } catch { /* noop */ }
  }
  return null;
}

export function parseChat(text: string): ParseResult {
  // Remove BOM e normaliza LF
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = clean.split("\n");

  const out: ParsedMensagem[] = [];
  let cur: ParsedMensagem | null = null;

  const flush = () => {
    if (!cur) return;
    // Detecta anexo no corpo acumulado
    const body = (cur.conteudo_texto ?? "").trim();
    if (body) {
      const { nome, rest } = detectAttachment(body);
      if (nome) {
        const kind = classifyMedia(nome);
        if (kind) {
          cur.tipo = kind;
          cur.midia_nome = nome;
          cur.conteudo_texto = rest || null;
        }
      }
    } else {
      cur.conteudo_texto = null;
    }
    out.push(cur);
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\u200E|\u200F/g, ""); // LRM/RLM
    if (!line.trim()) {
      if (cur) cur.conteudo_texto = (cur.conteudo_texto ?? "") + "\n";
      continue;
    }
    const header = tryHeader(line);
    if (header) {
      flush();
      const fone = foneFromSender(header.sender);
      cur = {
        timestamp: header.ts,
        remetente_nome: header.system ? null : header.sender,
        remetente_fone_e164: fone,
        tipo: header.system ? "sistema" : "texto",
        conteudo_texto: header.rest || null,
        midia_nome: null,
      };
    } else if (cur) {
      cur.conteudo_texto = ((cur.conteudo_texto ?? "") + "\n" + line);
    }
  }
  flush();

  const timestamps = out.map((m) => m.timestamp).sort();
  return {
    mensagens: out,
    periodo_inicio: timestamps[0] ?? null,
    periodo_fim: timestamps[timestamps.length - 1] ?? null,
  };
}

export function normalizeFone(input: string | null | undefined, defaultCountry: "BR" = "BR"): string | null {
  if (!input) return null;
  try {
    const p = parsePhoneNumberFromString(input, defaultCountry);
    if (p && p.isValid()) return p.number;
  } catch { /* noop */ }
  return null;
}

/** Últimos 8 dígitos (heurística de match com telefones cadastrados). */
export function tail8(fone: string | null | undefined): string | null {
  if (!fone) return null;
  const digits = fone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(-8);
}