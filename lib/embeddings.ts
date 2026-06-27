import OpenAI from "openai";

/**
 * Real semantic embeddings via Perplexity's embeddings endpoint. Model IDs and
 * the base64_int8 encoding requirement verified directly against the live API
 * on 2026-06-27 — Perplexity rejects the standard OpenAI "float" encoding and
 * its own model names differ from OpenAI's (`pplx-embed-v1-0.6b`, not
 * `text-embedding-3-small`).
 */
const EMBED_MODEL = "pplx-embed-v1-0.6b";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PERPLEXITY_API_KEY in .env.development");
  }
  client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai/v1" });
  return client;
}

/** Decodes a base64_int8-encoded embedding into a plain numeric vector. */
function decodeInt8(base64: string): number[] {
  const buf = Buffer.from(base64, "base64");
  return Array.from(new Int8Array(buf.buffer, buf.byteOffset, buf.length));
}

/** Embeds a batch of texts. Returns one vector per input, in order. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await getClient().embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    encoding_format: "base64_int8",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return response.data
    .sort((a, b) => a.index - b.index)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d) => decodeInt8((d as any).embedding as string));
}

/** Embeds a single text — convenience wrapper around `embed`. */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}

/** Cosine similarity between two vectors of equal length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
