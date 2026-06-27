import { complete } from "@/lib/perplexity";
import { querySemanticGraph, type Citation, type GraphHit } from "@/lib/chat/tools";

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
  groundingEmpty: boolean;
}

const MIN_RELEVANCE = 0.3;

/**
 * Real RAG, real grounding, one retrieval mechanism: embed the question, rank every
 * embedded node in the graph by cosine similarity (lib/chat/tools.ts's
 * querySemanticGraph), then ask Perplexity to compose a short answer from ONLY that —
 * never the model's own knowledge of GDPR, employment law, or anything else. If the best
 * match is below MIN_RELEVANCE, nothing actually answers the question, so citations are
 * dropped and the model is told explicitly so it says so plainly rather than stretching
 * a weak match into an answer.
 */
export async function answerQuestion(question: string, matterId?: string): Promise<ChatAnswer> {
  const { hits, citations, topScore } = await querySemanticGraph(question, matterId);
  const groundingEmpty = topScore < MIN_RELEVANCE;
  const context = groundingEmpty ? "(no matching data found in the knowledgebase)" : renderHits(hits);

  const prompt = `You are Quinn, the user's grounded chat assistant. Address the user directly as "you".
Answer the question using ONLY the knowledgebase data below — never your own knowledge of GDPR,
employment law, or anything else. If the data below is empty or doesn't actually answer the question,
say plainly that Quinn's graph has no matching results, and suggest you run analysis or check the matter.
Do not fill gaps with general knowledge, even if you're confident it's correct — only what's listed below
is verified to be true for this case. Be concise (2-5 sentences). Reference titles / matter names exactly
as given.

QUESTION: "${question}"

KNOWLEDGEBASE:
${context}`;

  const answer = await complete(prompt, { maxOutputTokens: 400 });

  return { answer, citations: groundingEmpty ? [] : citations, groundingEmpty };
}

function renderHits(hits: GraphHit[]): string {
  if (hits.length === 0) return "(no matching data found in the knowledgebase)";
  const lines = hits.map(
    (h) => `- ${h.matterName ? `[${h.matterName}] ` : ""}${h.type}: ${h.title} — ${h.snippet || "(no detail)"}`
  );
  return `Semantically closest items in the graph (${hits.length} found):\n${lines.join("\n")}`;
}
