import OpenAI from "openai";

/**
 * Perplexity's Agent API is OpenAI-Responses-compatible: same SDK, same
 * `client.responses.create()` call, pointed at Perplexity's base URL.
 * Model IDs follow a `provider/model` convention (verified against
 * https://docs.perplexity.ai/docs/agent-api/models on 2026-06-27).
 */
export const MODELS = {
  /** Cheap, fast, web-grounded — default for the high-volume clause loop. */
  fast: "perplexity/sonar",
  /** Routed to for high-stakes clauses when configured. */
  reasoning: "anthropic/claude-sonnet-4-6",
} as const;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing PERPLEXITY_API_KEY in .env.local");
  }
  client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai/v1" });
  return client;
}

export interface JsonSchemaSpec {
  /** 1-64 alphanumeric/underscore chars, per Perplexity's schema naming rule. */
  name: string;
  schema: Record<string, unknown>;
}

/** Plain text completion. Used for the health check and the chat layer. */
export async function complete(
  input: string,
  opts: { model?: string; maxOutputTokens?: number } = {}
): Promise<string> {
  const response = await getClient().responses.create({
    model: opts.model ?? MODELS.fast,
    input,
    max_output_tokens: opts.maxOutputTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response as any).output_text ?? "";
}

/** Strict-JSON completion via Perplexity's response_format / json_schema mechanism. */
export async function completeJSON<T>(
  input: string,
  jsonSchema: JsonSchemaSpec,
  opts: { model?: string; maxOutputTokens?: number } = {}
): Promise<T> {
  const response = await getClient().responses.create({
    model: opts.model ?? MODELS.fast,
    input,
    max_output_tokens: opts.maxOutputTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: jsonSchema.name,
        schema: jsonSchema.schema,
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (response as any).output_text ?? "{}";
  return JSON.parse(text) as T;
}

/** Research sub-agent: web_search + fetch_url enabled. Off the critical demo path. */
export async function researchWithTools(
  input: string,
  opts: { model?: string } = {}
): Promise<{ text: string; raw: unknown }> {
  const response = await getClient().responses.create({
    model: opts.model ?? MODELS.fast,
    input,
    tools: [{ type: "web_search" }, { type: "fetch_url" }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text: (response as any).output_text ?? "",
    raw: response,
  };
}

/** Verifies the API key + connectivity with a trivial call; throws the real error on failure. */
export async function pingPerplexity(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await complete("Reply with the single word: ok", { maxOutputTokens: 16 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
