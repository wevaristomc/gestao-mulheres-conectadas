// Embeddings server-only para a Base de Conhecimento (RAG).
// Usa Lovable AI Gateway com openai/text-embedding-3-small (1536 dims) — cabe
// no índice HNSW direto criado em documentos_chunks. Este arquivo NÃO deve ser
// importado do cliente (o sufixo .server.ts é bloqueado pelo bundler).

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

function apiKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY não configurada no ambiente do servidor.");
  return k;
}

export async function embedTextos(inputs: string[]): Promise<number[][]> {
  const clean = inputs.map((s) => (s ?? "").trim()).filter((s) => s.length > 0);
  if (clean.length === 0) return [];
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: clean,
      dimensions: EMBEDDING_DIMS,
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Embeddings gateway falhou (${res.status}): ${txt.slice(0, 300)}`);
  const body = JSON.parse(txt) as { data?: { index: number; embedding: number[] }[] };
  const out = new Array<number[]>(clean.length);
  for (const row of body.data ?? []) out[row.index] = row.embedding;
  return out;
}

export async function embedTexto(input: string): Promise<number[] | null> {
  const [v] = await embedTextos([input]);
  return v ?? null;
}

/** Chunking simples por parágrafo, com janela alvo (~1200 chars) e overlap. */
export function chunkTexto(texto: string, alvo = 1200, overlap = 150): string[] {
  const s = (texto ?? "").replace(/\r\n/g, "\n").trim();
  if (!s) return [];
  if (s.length <= alvo) return [s];

  const paragrafos = s.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paragrafos) {
    if (buf.length + p.length + 2 <= alvo) {
      buf = buf ? `${buf}\n\n${p}` : p;
      continue;
    }
    if (buf) chunks.push(buf);
    if (p.length <= alvo) {
      buf = p;
    } else {
      // parágrafo muito grande: quebra por caracteres respeitando overlap
      let i = 0;
      while (i < p.length) {
        const end = Math.min(i + alvo, p.length);
        chunks.push(p.slice(i, end));
        i = end - overlap;
        if (i < 0) i = 0;
        if (end === p.length) break;
      }
      buf = "";
    }
  }
  if (buf) chunks.push(buf);

  // adiciona overlap textual entre chunks consecutivos vindos de parágrafos distintos
  if (overlap > 0 && chunks.length > 1) {
    for (let i = 1; i < chunks.length; i += 1) {
      const tailPrev = chunks[i - 1].slice(-overlap);
      if (!chunks[i].startsWith(tailPrev)) chunks[i] = `${tailPrev} ${chunks[i]}`;
    }
  }
  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

/** Formata um vetor number[] em literal aceito pelo tipo `vector` do pgvector. */
export function vetorToLiteral(v: number[]): string {
  return `[${v.map((n) => (Number.isFinite(n) ? n.toString() : "0")).join(",")}]`;
}