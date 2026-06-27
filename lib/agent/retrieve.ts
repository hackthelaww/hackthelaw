import { runRead } from "@/lib/neo4j";

export interface ProvisionRecord {
  id: string;
  celex: string;
  article: string;
  title: string;
  text: string;
  source: string;
}

export interface PlaybookRuleRecord {
  id: string;
  code: string;
  title: string;
  requirement: string;
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "shall", "from", "have", "has",
  "are", "was", "were", "will", "such", "any", "all", "may", "not", "but",
  "its", "their", "into", "upon", "under", "where", "when", "than",
  "other", "each", "more", "than", "which", "these", "those", "there", "been",
  "being", "also", "only", "must", "can", "would", "could", "should", "you",
  "your",
]);

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));
}

function overlapScore(queryTokens: string[], docTokens: string[]): number {
  const docSet = new Set(docTokens);
  const shared = queryTokens.filter((t) => docSet.has(t)).length;
  return shared / Math.sqrt(docTokens.length || 1);
}

/**
 * Keyword retrieval over the live graph: scores every Provision against the
 * clause text by significant-token overlap, with an explicit boost when the
 * clause text directly names an article number (very common in DPAs, e.g.
 * "as described in Article 28"). No vector index in this build — transparent
 * and fast enough for ~100 provisions.
 */
export async function retrieveProvisions(clauseText: string, k = 6): Promise<ProvisionRecord[]> {
  const records = await runRead(
    `MATCH (p:Provision) RETURN p.id AS id, p.celex AS celex, p.article AS article, p.title AS title, p.text AS text, p.source AS source`
  );

  const queryTokens = significantTokens(clauseText);
  const mentionedArticles = new Set(
    [...clauseText.matchAll(/\bArticle\s+(\d{1,3})\b/gi)].map((m) => m[1])
  );

  const scored = records.map((rec) => {
    const provision: ProvisionRecord = {
      id: rec.get("id"),
      celex: rec.get("celex"),
      article: rec.get("article"),
      title: rec.get("title"),
      text: rec.get("text"),
      source: rec.get("source"),
    };
    const docTokens = significantTokens(`${provision.title} ${provision.text}`);
    let score = overlapScore(queryTokens, docTokens);
    if (mentionedArticles.has(provision.article)) score += 10;
    return { provision, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((s) => s.score > 0)
    .map((s) => s.provision);
}

/** Only ~10 firm rules exist — send all of them and let the model judge relevance. */
export async function retrieveAllPlaybookRules(): Promise<PlaybookRuleRecord[]> {
  const records = await runRead(
    `MATCH (r:PlaybookRule) RETURN r.id AS id, r.code AS code, r.title AS title, r.requirement AS requirement`
  );
  return records.map((rec) => ({
    id: rec.get("id"),
    code: rec.get("code"),
    title: rec.get("title"),
    requirement: rec.get("requirement"),
  }));
}
