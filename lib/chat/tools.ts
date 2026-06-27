import { runRead } from "@/lib/neo4j";

export interface Citation {
  type: "clause" | "matter" | "provision" | "playbookRule" | "episode";
  id: string;
  label: string;
}

export interface ClauseHit {
  matterId: string;
  matterName: string;
  clauseId: string;
  ref: string;
  heading: string;
  status: string | null;
  summary: string | null;
}

function clauseCitation(h: ClauseHit): Citation {
  return { type: "clause", id: h.clauseId, label: `${h.matterName} — clause ${h.ref}` };
}

/** "Which clauses rely on GDPR Article 28?" */
export async function queryByProvisionArticle(article: string): Promise<{ hits: ClauseHit[]; citations: Citation[] }> {
  const records = await runRead(
    `MATCH (p:Provision {article: $article})<-[:RELIES_ON]-(f:Finding)<-[r:ASSESSED_AS]-(c:Clause)
     WHERE r.expiredAt IS NULL
     MATCH (m:Matter {id: c.matterId})
     RETURN m.id AS matterId, m.name AS matterName, c.id AS clauseId, c.ref AS ref, c.heading AS heading,
            f.status AS status, f.summary AS summary`,
    { article }
  );
  const hits = records.map(toClauseHit);
  return {
    hits,
    citations: [
      { type: "provision", id: `gdpr-art-${article}`, label: `GDPR Article ${article}` },
      ...hits.map(clauseCitation),
    ],
  };
}

/** "Which of my open matters touch sub-processor obligations?" — keyword over playbook rules + clause text. */
export async function queryByKeyword(keyword: string): Promise<{ hits: ClauseHit[]; citations: Citation[] }> {
  const records = await runRead(
    `MATCH (c:Clause)
     WHERE toLower(c.text) CONTAINS toLower($keyword) OR toLower(c.heading) CONTAINS toLower($keyword)
     MATCH (m:Matter {id: c.matterId})
     OPTIONAL MATCH (c)-[r:ASSESSED_AS]->(f:Finding) WHERE r.expiredAt IS NULL
     RETURN m.id AS matterId, m.name AS matterName, c.id AS clauseId, c.ref AS ref, c.heading AS heading,
            f.status AS status, f.summary AS summary`,
    { keyword }
  );
  const ruleRecords = await runRead(
    `MATCH (r:PlaybookRule)
     WHERE toLower(r.title) CONTAINS toLower($keyword) OR toLower(r.requirement) CONTAINS toLower($keyword)
     RETURN r.id AS id, r.title AS title`,
    { keyword }
  );
  const hits = records.map(toClauseHit);
  return {
    hits,
    citations: [
      ...ruleRecords.map((r) => ({ type: "playbookRule" as const, id: r.get("id"), label: r.get("title") })),
      ...hits.map(clauseCitation),
    ],
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

function toClauseHit(rec: import("neo4j-driver").Record): ClauseHit {
  return {
    matterId: rec.get("matterId"),
    matterName: rec.get("matterName"),
    clauseId: rec.get("clauseId"),
    ref: rec.get("ref"),
    heading: rec.get("heading"),
    status: rec.get("status"),
    summary: rec.get("summary"),
  };
}
