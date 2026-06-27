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
    const assessments = (rec.get("assessments") as { triageScore: number | null; createdAt: unknown }[]).filter(
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
      const ts = toNumber(a.createdAt);
      if (ts !== 0 && (lastUpdatedAt === null || ts > lastUpdatedAt)) {
        lastUpdatedAt = ts;
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
      validAt: toNumber(rec.get("validAt")) || null,
      createdAt: toNumber(rec.get("createdAt")) || null,
      latestReviewDecision: rec.get("latestReviewDecision"),
    };
  });

  return {
    matter: { id: m.get("id"), name: m.get("name"), client: m.get("client"), type: m.get("type"), status: m.get("status") },
    parties: partyRecords.map((r) => ({ id: r.get("id"), name: r.get("name"), role: r.get("role") })),
    clauses,
  };
}

export interface MatterTimeRange {
  earliest: number | null;
  latest: number | null;
}

/** The full createdAt range across every version of every fact for a matter (not just current ones). */
export async function getMatterTimeRange(matterId: string): Promise<MatterTimeRange> {
  const records = await runRead(
    `MATCH (c:Clause {matterId: $matterId})-[r:ASSESSED_AS]->(:Finding)
     RETURN min(r.createdAt) AS earliest, max(r.createdAt) AS latest`,
    { matterId }
  );
  if (records.length === 0) return { earliest: null, latest: null };
  return {
    earliest: toNumber(records[0].get("earliest")) || null,
    latest: toNumber(records[0].get("latest")) || null,
  };
}

export interface GraphNode {
  id: string;
  label: "Matter" | "Party" | "Clause" | "Finding" | "Provision" | "PlaybookRule" | "Review" | "SignOff";
  caption: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  caption?: string;
}

export interface MatterGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type Neo4jNode = { properties: Record<string, unknown> };

/**
 * The matter's subgraph as Quinn believed it at instant t: parties, clauses,
 * each clause's current-as-of-t finding (same bi-temporal window as
 * snapshotAt), and what that finding relied on, deviated from, and was
 * reviewed/signed off by — all filtered to have existed by t.
 */
export async function getMatterGraph(matterId: string, t: number): Promise<MatterGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const matterRecords = await runRead(`MATCH (m:Matter {id: $matterId}) RETURN m`, { matterId });
  if (matterRecords.length === 0) return { nodes, edges };
  const matter = matterRecords[0].get("m") as Neo4jNode;
  nodes.push({
    id: matterId,
    label: "Matter",
    caption: String(matter.properties.name),
    properties: matter.properties,
  });

  const partyRecords = await runRead(
    `MATCH (m:Matter {id: $matterId})-[:INVOLVES]->(p:Party) RETURN p`,
    { matterId }
  );
  for (const rec of partyRecords) {
    const p = rec.get("p") as Neo4jNode;
    const id = p.properties.id as string;
    nodes.push({ id, label: "Party", caption: String(p.properties.name), properties: p.properties });
    edges.push({ id: `${matterId}-involves-${id}`, from: matterId, to: id, type: "INVOLVES" });
  }

  const clauseRecords = await runRead(
    `MATCH (c:Clause {matterId: $matterId})
     OPTIONAL MATCH (c)-[r:ASSESSED_AS]->(f:Finding)
       WHERE r.validAt <= $t AND (r.invalidAt IS NULL OR r.invalidAt > $t)
         AND r.createdAt <= $t AND (r.expiredAt IS NULL OR r.expiredAt > $t)
     RETURN c, f`,
    { matterId, t }
  );
  const findingIds: string[] = [];
  for (const rec of clauseRecords) {
    const c = rec.get("c") as Neo4jNode;
    const clauseId = c.properties.id as string;
    nodes.push({ id: clauseId, label: "Clause", caption: String(c.properties.ref), properties: c.properties });
    edges.push({ id: `${matterId}-clause-${clauseId}`, from: matterId, to: clauseId, type: "HAS_CLAUSE" });

    const f = rec.get("f") as Neo4jNode | null;
    if (f) {
      const findingId = f.properties.id as string;
      nodes.push({
        id: findingId,
        label: "Finding",
        caption: String(f.properties.status),
        properties: f.properties,
      });
      edges.push({ id: `assessed-${clauseId}`, from: clauseId, to: findingId, type: "ASSESSED_AS" });
      findingIds.push(findingId);
    }
  }

  if (findingIds.length > 0) {
    const relyRecords = await runRead(
      `MATCH (f:Finding)-[:RELIES_ON]->(p:Provision) WHERE f.id IN $findingIds RETURN f.id AS findingId, p`,
      { findingIds }
    );
    for (const rec of relyRecords) {
      const p = rec.get("p") as Neo4jNode;
      const provisionId = p.properties.id as string;
      const findingId = rec.get("findingId") as string;
      if (!nodes.some((n) => n.id === provisionId)) {
        nodes.push({
          id: provisionId,
          label: "Provision",
          caption: `Art. ${p.properties.article}`,
          properties: p.properties,
        });
      }
      edges.push({ id: `relies-${findingId}-${provisionId}`, from: findingId, to: provisionId, type: "RELIES_ON" });
    }

    const deviationRecords = await runRead(
      `MATCH (f:Finding)-[d:DEVIATES_FROM]->(r:PlaybookRule)
       WHERE f.id IN $findingIds
       RETURN f.id AS findingId, r, d.explanation AS explanation`,
      { findingIds }
    );
    for (const rec of deviationRecords) {
      const r = rec.get("r") as Neo4jNode;
      const ruleId = r.properties.id as string;
      const findingId = rec.get("findingId") as string;
      if (!nodes.some((n) => n.id === ruleId)) {
        nodes.push({
          id: ruleId,
          label: "PlaybookRule",
          caption: String(r.properties.title),
          properties: r.properties,
        });
      }
      edges.push({
        id: `deviates-${findingId}-${ruleId}`,
        from: findingId,
        to: ruleId,
        type: "DEVIATES_FROM",
        caption: rec.get("explanation") as string,
      });
    }

    const reviewRecords = await runRead(
      `MATCH (rev:Review)-[:OF]->(f:Finding) WHERE f.id IN $findingIds AND rev.at <= $t RETURN f.id AS findingId, rev`,
      { findingIds, t }
    );
    for (const rec of reviewRecords) {
      const rev = rec.get("rev") as Neo4jNode;
      const reviewId = rev.properties.id as string;
      const findingId = rec.get("findingId") as string;
      nodes.push({ id: reviewId, label: "Review", caption: String(rev.properties.decision), properties: rev.properties });
      edges.push({ id: `review-${reviewId}`, from: reviewId, to: findingId, type: "OF" });
    }

    const signOffRecords = await runRead(
      `MATCH (so:SignOff)-[:ATTESTS]->(f:Finding) WHERE f.id IN $findingIds AND so.at <= $t RETURN f.id AS findingId, so`,
      { findingIds, t }
    );
    for (const rec of signOffRecords) {
      const so = rec.get("so") as Neo4jNode;
      const signOffId = so.properties.id as string;
      const findingId = rec.get("findingId") as string;
      nodes.push({ id: signOffId, label: "SignOff", caption: "Signed off", properties: so.properties });
      edges.push({ id: `signoff-${signOffId}`, from: signOffId, to: findingId, type: "ATTESTS" });
    }
  }

  return { nodes, edges };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}
