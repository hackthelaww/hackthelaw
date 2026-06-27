import { runRead } from "@/lib/neo4j";
import { laneFor, type TriageLane } from "@/lib/agent/triage";

export interface MatterOverview {
  id: string;
  name: string;
  client: string | null;
  type: string;
  status: string;
  clauseCount: number;
  assessedCount: number;
  needsJudgementCount: number;
  quickConfirmCount: number;
  autoClearedCount: number;
  lastUpdatedAt: number | null;
}

export async function listMattersOverview(): Promise<MatterOverview[]> {
  const records = await runRead(
    `MATCH (m:Matter)
     OPTIONAL MATCH (m)<-[:INVOLVES]-()
     OPTIONAL MATCH (c:Clause {matterId: m.id})
     OPTIONAL MATCH (c)-[r:ASSESSED_AS]->(f:Finding) WHERE r.expiredAt IS NULL
     RETURN m.id AS id, m.name AS name, m.client AS client, m.type AS type, m.status AS status,
            count(DISTINCT c) AS clauseCount,
            collect(DISTINCT {triageScore: f.triageScore, createdAt: r.createdAt}) AS assessments`
  );

  return records.map((rec) => {
    const assessments = (rec.get("assessments") as { triageScore: number | null; createdAt: number | null }[]).filter(
      (a) => a.triageScore !== null
    );
    const lanesCounts: Record<TriageLane, number> = {
      needs_judgement: 0,
      quick_confirm: 0,
      auto_cleared: 0,
    };
    let lastUpdatedAt: number | null = null;
    for (const a of assessments) {
      lanesCounts[laneFor(a.triageScore as number)]++;
      if (a.createdAt !== null && (lastUpdatedAt === null || a.createdAt > lastUpdatedAt)) {
        lastUpdatedAt = a.createdAt;
      }
    }

    return {
      id: rec.get("id"),
      name: rec.get("name"),
      client: rec.get("client"),
      type: rec.get("type"),
      status: rec.get("status"),
      clauseCount: toNumber(rec.get("clauseCount")),
      assessedCount: assessments.length,
      needsJudgementCount: lanesCounts.needs_judgement,
      quickConfirmCount: lanesCounts.quick_confirm,
      autoClearedCount: lanesCounts.auto_cleared,
      lastUpdatedAt,
    };
  });
}

export interface ClauseWithFinding {
  clauseId: string;
  ref: string;
  heading: string;
  text: string;
  findingId: string | null;
  status: string | null;
  summary: string | null;
  confidence: number | null;
  riskScore: number | null;
  consequenceScore: number | null;
  triageScore: number | null;
  lane: TriageLane | "unassessed";
  validAt: number | null;
  createdAt: number | null;
  latestReviewDecision: string | null;
}

export interface MatterDetail {
  matter: { id: string; name: string; client: string | null; type: string; status: string };
  parties: { id: string; name: string; role: string }[];
  clauses: ClauseWithFinding[];
}

export async function getMatterDetail(matterId: string): Promise<MatterDetail | null> {
  const matterRecords = await runRead(
    `MATCH (m:Matter {id: $matterId}) RETURN m.id AS id, m.name AS name, m.client AS client, m.type AS type, m.status AS status`,
    { matterId }
  );
  if (matterRecords.length === 0) return null;
  const m = matterRecords[0];

  const partyRecords = await runRead(
    `MATCH (m:Matter {id: $matterId})-[:INVOLVES]->(p:Party) RETURN p.id AS id, p.name AS name, p.role AS role`,
    { matterId }
  );

  const clauseRecords = await runRead(
    `MATCH (c:Clause {matterId: $matterId})
     OPTIONAL MATCH (c)-[r:ASSESSED_AS]->(f:Finding) WHERE r.expiredAt IS NULL
     OPTIONAL MATCH (rev:Review)-[:OF]->(f)
     WITH c, r, f, rev ORDER BY rev.at DESC
     RETURN c.id AS clauseId, c.ref AS ref, c.heading AS heading, c.text AS text,
            f.id AS findingId, f.status AS status, f.summary AS summary, f.confidence AS confidence,
            f.riskScore AS riskScore, f.consequenceScore AS consequenceScore, f.triageScore AS triageScore,
            r.validAt AS validAt, r.createdAt AS createdAt,
            head(collect(rev.decision)) AS latestReviewDecision
     ORDER BY c.ref`,
    { matterId }
  );

  const clauses: ClauseWithFinding[] = clauseRecords.map((rec) => {
    const triageScore = rec.get("triageScore");
    return {
      clauseId: rec.get("clauseId"),
      ref: rec.get("ref"),
      heading: rec.get("heading"),
      text: rec.get("text"),
      findingId: rec.get("findingId"),
      status: rec.get("status"),
      summary: rec.get("summary"),
      confidence: rec.get("confidence"),
      riskScore: rec.get("riskScore"),
      consequenceScore: rec.get("consequenceScore"),
      triageScore,
      lane: triageScore === null ? "unassessed" : laneFor(triageScore),
      validAt: rec.get("validAt"),
      createdAt: rec.get("createdAt"),
      latestReviewDecision: rec.get("latestReviewDecision"),
    };
  });

  return {
    matter: { id: m.get("id"), name: m.get("name"), client: m.get("client"), type: m.get("type"), status: m.get("status") },
    parties: partyRecords.map((r) => ({ id: r.get("id"), name: r.get("name"), role: r.get("role") })),
    clauses,
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}
