import { randomUUID } from "crypto";
import { runWrite } from "@/lib/neo4j";
import type { FetchedProvision } from "@/lib/ingest/cellar";
import type { ParsedClause } from "@/lib/ingest/clauseParser";

/** All temporal/instant fields in the graph are epoch milliseconds (numbers). */
export function now(): number {
  return Date.now();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type EpisodeKind = "DOCUMENT_INGESTED" | "AGENT_ACTION" | "HUMAN_ACTION";

export interface EpisodeInput {
  kind: EpisodeKind;
  label: string;
  payloadRef?: string;
}

export async function writeEpisode(input: EpisodeInput): Promise<string> {
  const id = randomUUID();
  await runWrite(
    `CREATE (e:Episode {id: $id, kind: $kind, label: $label, payloadRef: $payloadRef, createdAt: $createdAt})`,
    { id, kind: input.kind, label: input.label, payloadRef: input.payloadRef ?? null, createdAt: now() }
  );
  return id;
}

export async function mentions(episodeId: string, nodeLabel: string, nodeId: string): Promise<void> {
  await runWrite(
    `MATCH (e:Episode {id: $episodeId})
     MATCH (n:${nodeLabel} {id: $nodeId})
     MERGE (e)-[:MENTIONS]->(n)`,
    { episodeId, nodeId }
  );
}

export async function writeProvision(p: FetchedProvision, episodeId: string): Promise<string> {
  const id = `gdpr-art-${p.article}`;
  await runWrite(
    `MERGE (p:Provision {id: $id})
     SET p.celex = $celex, p.article = $article, p.title = $title, p.text = $text, p.source = $source`,
    { id, celex: p.celex, article: p.article, title: p.title, text: p.text, source: p.source }
  );
  await mentions(episodeId, "Provision", id);
  return id;
}

export interface PlaybookRuleInput {
  code: string;
  title: string;
  requirement: string;
}

export async function writePlaybookRule(rule: PlaybookRuleInput, episodeId: string): Promise<string> {
  const id = rule.code;
  await runWrite(
    `MERGE (r:PlaybookRule {id: $id})
     SET r.code = $code, r.title = $title, r.requirement = $requirement`,
    { id, code: rule.code, title: rule.title, requirement: rule.requirement }
  );
  await mentions(episodeId, "PlaybookRule", id);
  return id;
}

export interface MatterInput {
  id: string;
  name: string;
  client: string | null;
  type: string;
  status: string;
}

export async function writeMatter(m: MatterInput): Promise<string> {
  await runWrite(
    `MERGE (m:Matter {id: $id})
     SET m.name = $name, m.client = $client, m.type = $type, m.status = $status`,
    { ...m }
  );
  return m.id;
}

export interface PartyInput {
  name: string;
  role: string;
}

export async function writeParty(matterId: string, party: PartyInput): Promise<string> {
  const id = `${matterId}::party::${slugify(party.name)}`;
  await runWrite(
    `MERGE (p:Party {id: $id})
     SET p.name = $name, p.role = $role
     WITH p
     MATCH (m:Matter {id: $matterId})
     MERGE (m)-[:INVOLVES]->(p)`,
    { id, name: party.name, role: party.role, matterId }
  );
  return id;
}

export async function writeClause(
  matterId: string,
  clause: ParsedClause,
  episodeId: string
): Promise<string> {
  const id = `${matterId}::clause::${slugify(clause.ref)}`;
  await runWrite(
    `MERGE (c:Clause {id: $id})
     SET c.ref = $ref, c.heading = $heading, c.text = $text, c.matterId = $matterId`,
    { id, ref: clause.ref, heading: clause.heading, text: clause.text, matterId }
  );
  await mentions(episodeId, "Clause", id);
  return id;
}
