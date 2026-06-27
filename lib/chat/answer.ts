import { complete } from "@/lib/perplexity";
import { parseSince } from "@/lib/chat/parseSince";
import {
  queryByProvisionArticle,
  queryByKeyword,
  queryRecentChanges,
  type Citation,
  type ClauseHit,
  type ChangeEntry,
} from "@/lib/chat/tools";

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
  groundingEmpty: boolean;
}

const KEYWORD_TRIGGERS = [
  "sub-processor",
  "subprocessor",
  "sub processor",
  "audit",
  "breach",
  "confidentiality",
  "international transfer",
  "data return",
  "deletion",
];

/**
 * Routes a question to real graph queries (never the model's own memory),
 * then asks Perplexity to compose a short answer grounded ONLY in what the
 * graph returned. If a query returns nothing, the model is told explicitly
 * so it can say "no results" rather than invent something plausible.
 */
export async function answerQuestion(question: string): Promise<ChatAnswer> {
  const articleMatch = question.match(/article\s+(\d{1,3})/i);
  const sinceMs = parseSince(question);
  const mentionsChange = /(changed|change|since|updated|update|flip)/i.test(question);
  const keywordHit = KEYWORD_TRIGGERS.find((k) => question.toLowerCase().includes(k));

  let context: string;
  let citations: Citation[];

  if (articleMatch) {
    const { hits, citations: c } = await queryByProvisionArticle(articleMatch[1]);
    context = renderClauseHits(`Clauses relying on GDPR Article ${articleMatch[1]} (current beliefs)`, hits);
    citations = c;
  } else if (mentionsChange && sinceMs !== null) {
    const { hits, citations: c } = await queryRecentChanges(sinceMs);
    context = renderChanges(sinceMs, hits);
    citations = c;
  } else if (keywordHit) {
    const { hits, citations: c } = await queryByKeyword(keywordHit);
    context = renderClauseHits(`Clauses and rules touching "${keywordHit}"`, hits);
    citations = c;
  } else {
    // Generic fallback: try every significant word as a keyword match.
    const words = question
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const merged: ClauseHit[] = [];
    const seen = new Set<string>();
    for (const word of words.slice(0, 5)) {
      const { hits } = await queryByKeyword(word);
      for (const h of hits) {
        if (!seen.has(h.clauseId)) {
          seen.add(h.clauseId);
          merged.push(h);
        }
      }
    }
    context = renderClauseHits("Clauses matching keywords from the question", merged);
    citations = merged.map((h) => ({ type: "clause" as const, id: h.clauseId, label: `${h.matterName} — clause ${h.ref}` }));
  }

  const groundingEmpty = citations.length === 0;

  const prompt = `You are Quinn's grounded chat assistant. Answer the partner's question using ONLY the
graph data below — never your own knowledge of GDPR or any contract. If the data below is empty or
doesn't answer the question, say plainly that Quinn's graph has no matching results, and suggest the
partner run analysis or check the matter. Be concise (2-5 sentences). Reference clause refs / matter
names / article numbers exactly as given.

QUESTION: "${question}"

GRAPH DATA:
${context || "(no matching data found in the graph)"}`;

  const answer = await complete(prompt, { maxOutputTokens: 400 });

  return { answer, citations, groundingEmpty };
}

function renderClauseHits(title: string, hits: ClauseHit[]): string {
  if (hits.length === 0) return `${title}: none found.`;
  const lines = hits
    .slice(0, 20)
    .map((h) => `- [${h.matterName}] Clause ${h.ref} (${h.heading}) — status: ${h.status ?? "not yet assessed"}`);
  return `${title} (${hits.length} found):\n${lines.join("\n")}`;
}

function renderChanges(sinceMs: number, hits: ChangeEntry[]): string {
  if (hits.length === 0) return `No assessment changes recorded since ${new Date(sinceMs).toISOString()}.`;
  const lines = hits.map(
    (h) =>
      `- [${h.matterName}] Clause ${h.ref} (${h.heading}): ${h.fromStatus ?? "unassessed"} -> ${h.toStatus} at ${new Date(h.changedAt).toISOString()}`
  );
  return `Changes since ${new Date(sinceMs).toISOString()} (${hits.length} found):\n${lines.join("\n")}`;
}
