import { runRead } from "@/lib/neo4j";
import { embed, embedOne, cosineSimilarity } from "@/lib/embeddings";

export interface Citation {
  type: "clause" | "matter" | "provision" | "playbookRule" | "episode" | "entity";
  id: string;
  label: string;
}

const SEMANTIC_TOP_K = 10;
const SNIPPET_LENGTH = 280;

export interface GraphHit {
  /** e.g. "Clause", "GDPR Provision", "Playbook Rule", or the entity_type the extraction
   *  agent picked ("Obligation", "Remedy", "Party", etc.) — whatever the node actually is. */
  type: string;
  /** null for matter-independent nodes (Provision, PlaybookRule). */
  matterName: string | null;
  id: string;
  title: string;
  snippet: string;
}

function graphHitCitation(h: GraphHit): Citation {
  const label = h.matterName ? `${h.matterName} — ${h.type}: ${h.title}` : `${h.type}: ${h.title}`;
  return { type: "entity", id: h.id, label };
}

function toGraphHit(rec: import("neo4j-driver").Record): GraphHit {
  const snippet = (rec.get("snippet") as string) ?? "";
  return {
    type: rec.get("type"),
    matterName: rec.get("matterName"),
    id: rec.get("id"),
    title: rec.get("title"),
    snippet: snippet.length > SNIPPET_LENGTH ? `${snippet.slice(0, SNIPPET_LENGTH)}…` : snippet,
  };
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) =>
    typeof v === "number"
      ? v
      : typeof (v as { toNumber?: () => number })?.toNumber === "function"
        ? (v as { toNumber: () => number }).toNumber()
        : Number(v ?? 0)
  );
}

/**
 * Every embedded node in the graph — Clause, Entity (any entity_type), Provision,
 * PlaybookRule — in one shape, regardless of which pipeline wrote it (the TS static
 * ingest or the Python live-document extraction backend, which use different property
 * schemas — see RETURN clauses below).
 *
 * When matterId is provided, only nodes belonging to that matter are returned.
 */
async function fetchAllEmbeddedNodes(matterId?: string) {
  const matterFilter = matterId ? `{id: $matterId}` : ``;
  return runRead(
    `MATCH (c:Clause) WHERE c.embedding IS NOT NULL
     MATCH (m:Matter ${matterFilter}) WHERE m.id = c.matterId
     RETURN 'Clause' AS type, m.name AS matterName, c.id AS id, c.heading AS title, c.text AS snippet, c.embedding AS embedding
     UNION
     MATCH (n:Entity) WHERE n.embedding IS NOT NULL
     MATCH (m:Matter ${matterFilter}) WHERE m.id = n.matter_id
     RETURN n.entity_type AS type, m.name AS matterName, n.id AS id, n.name AS title,
            coalesce(n.description, n.verbatim_text, '') AS snippet, n.embedding AS embedding
     UNION
     MATCH (p:Provision) WHERE p.embedding IS NOT NULL
     RETURN 'GDPR Provision' AS type, null AS matterName, p.id AS id, p.title AS title, p.text AS snippet, p.embedding AS embedding
     UNION
     MATCH (r:PlaybookRule) WHERE r.embedding IS NOT NULL
     RETURN 'Playbook Rule' AS type, null AS matterName, r.id AS id, r.title AS title, r.requirement AS snippet, r.embedding AS embedding`,
    matterId ? { matterId } : {}
  );
}

/**
 * Fallback: fetch Entity nodes that have NO embedding but do have textual
 * content, so the chat can still answer from them via on-the-fly embedding.
 */
async function fetchUnembeddedEntities(matterId?: string) {
  const matterFilter = matterId ? `{id: $matterId}` : ``;
  return runRead(
    `MATCH (n:Entity) WHERE n.embedding IS NULL
     MATCH (m:Matter ${matterFilter}) WHERE m.id = n.matter_id
     RETURN n.entity_type AS type, m.name AS matterName, n.id AS id, n.name AS title,
            coalesce(n.description, n.verbatim_text, '') AS snippet`,
    matterId ? { matterId } : {}
  );
}

/**
 * The chat's only retrieval mechanism: embed the question, rank every embedded node in
 * the graph (any matter, any node type) by cosine similarity, return the top K. No
 * keyword/regex routing — this is what the LLM is given to answer from, and ONLY this;
 * it's told explicitly to say so if nothing relevant comes back rather than guess.
 */
export async function querySemanticGraph(question: string, matterId?: string): Promise<{ hits: GraphHit[]; citations: Citation[]; topScore: number }> {
  const [queryVector, embeddedRecords, unembeddedRecords] = await Promise.all([
    embedOne(question),
    fetchAllEmbeddedNodes(matterId),
    fetchUnembeddedEntities(matterId),
  ]);

  // Score embedded nodes by cosine similarity
  const scored = embeddedRecords
    .map((rec) => ({ hit: toGraphHit(rec), score: cosineSimilarity(queryVector, toNumberArray(rec.get("embedding"))) }))
    .sort((a, b) => b.score - a.score);

  // If we have unembedded entities, embed their text on-the-fly and score them too
  if (unembeddedRecords.length > 0) {
    const texts = unembeddedRecords.map((rec) => {
      const title = rec.get("title") as string;
      const snippet = rec.get("snippet") as string;
      return `${title}\n\n${snippet}`;
    });
    const vectors = await embed(texts);
    for (let i = 0; i < unembeddedRecords.length; i++) {
      const rec = unembeddedRecords[i];
      const score = cosineSimilarity(queryVector, vectors[i]);
      scored.push({ hit: toGraphHit(rec), score });
    }
    scored.sort((a, b) => b.score - a.score);
  }

  const ranked = scored.slice(0, SEMANTIC_TOP_K).map((r) => r.hit);

  return {
    hits: ranked,
    citations: ranked.map(graphHitCitation),
    topScore: scored[0]?.score ?? 0,
  };
}

export interface ChangeEntry {
  matterId: string;
  matterName: string;
  clauseId: string;
  ref: string;
  heading: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: number;
}

/** "What changed in this matter since <T>?" — every ASSESSED_AS edge created after T, with its predecessor's status. */
export async function queryRecentChanges(sinceMs: number, matterId?: string): Promise<{ hits: ChangeEntry[]; citations: Citation[] }> {
  const records = await runRead(
    `MATCH (c:Clause)-[r:ASSESSED_AS]->(f:Finding)
     WHERE r.createdAt > $sinceMs AND ($matterId IS NULL OR c.matterId = $matterId)
     MATCH (m:Matter {id: c.matterId})
     OPTIONAL MATCH (c)-[prevR:ASSESSED_AS]->(prevF:Finding)
       WHERE prevR.createdAt < r.createdAt
     WITH c, r, f, m, prevF, prevR ORDER BY prevR.createdAt DESC
     RETURN m.id AS matterId, m.name AS matterName, c.id AS clauseId, c.ref AS ref, c.heading AS heading,
            f.status AS toStatus, r.createdAt AS changedAt,
            head(collect(prevF.status)) AS fromStatus
     ORDER BY r.createdAt DESC`,
    { sinceMs, matterId: matterId ?? null }
  );
  const hits: ChangeEntry[] = records.map((rec) => ({
    matterId: rec.get("matterId"),
    matterName: rec.get("matterName"),
    clauseId: rec.get("clauseId"),
    ref: rec.get("ref"),
    heading: rec.get("heading"),
    fromStatus: rec.get("fromStatus"),
    toStatus: rec.get("toStatus"),
    changedAt: rec.get("changedAt"),
  }));
  return {
    hits,
    citations: hits.map((h) => ({ type: "clause", id: h.clauseId, label: `${h.matterName} — clause ${h.ref}` })),
  };
}
