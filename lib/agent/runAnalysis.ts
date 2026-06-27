import { runRead } from "@/lib/neo4j";
import { writeEpisode } from "@/lib/graph/ingestWriters";
import { assertFact, supersedeFact, getCurrentAssessment } from "@/lib/graph/temporal";
import { computeTriageScore } from "@/lib/agent/triage";
import { retrieveProvisions, retrieveAllPlaybookRules } from "@/lib/agent/retrieve";
import { analyzeClause, type ClauseInput } from "@/lib/agent/analyze";
import { MODELS } from "@/lib/perplexity";

export interface ClauseRecord extends ClauseInput {
  id: string;
  matterId: string;
}

export async function getClausesForMatter(matterId: string): Promise<ClauseRecord[]> {
  const records = await runRead(
    `MATCH (c:Clause {matterId: $matterId}) RETURN c.id AS id, c.ref AS ref, c.heading AS heading, c.text AS text, c.matterId AS matterId ORDER BY c.ref`,
    { matterId }
  );
  return records.map((rec) => ({
    id: rec.get("id"),
    ref: rec.get("ref"),
    heading: rec.get("heading"),
    text: rec.get("text"),
    matterId: rec.get("matterId"),
  }));
}

export type AnalysisEvent =
  | { type: "start"; clauseId: string; ref: string; heading: string }
  | { type: "done"; clauseId: string; ref: string; findingId: string; status: string; triageScore: number }
  | { type: "error"; clauseId: string; ref: string; message: string };

export interface AnalyzeMatterOptions {
  model?: string;
  onEvent?: (event: AnalysisEvent) => void;
}

/**
 * Analyzes every clause in a matter, one Perplexity call each. Writes each
 * result as a real bi-temporal fact: assertFact for a clause's first-ever
 * assessment, supersedeFact if re-running analysis on a clause that already
 * has a current one (so the prior belief is closed, not deleted).
 */
export async function analyzeMatterClauses(
  matterId: string,
  opts: AnalyzeMatterOptions = {}
): Promise<AnalysisEvent[]> {
  const clauses = await getClausesForMatter(matterId);
  const rules = await retrieveAllPlaybookRules();
  const events: AnalysisEvent[] = [];

  const emit = (event: AnalysisEvent) => {
    events.push(event);
    opts.onEvent?.(event);
  };

  for (const clause of clauses) {
    emit({ type: "start", clauseId: clause.id, ref: clause.ref, heading: clause.heading });
    try {
      const provisions = await retrieveProvisions(clause.text);
      const result = await analyzeClause(clause, provisions, rules, {
        model: opts.model ?? MODELS.fast,
      });

      const triageScore = computeTriageScore(result);

      const episodeId = await writeEpisode({
        kind: "AGENT_ACTION",
        label: `Clause ${clause.ref} analyzed by ${opts.model ?? MODELS.fast}`,
        payloadRef: clause.id,
      });

      const citedProvisionIds = result.citedProvisions
        .map((c) => {
          const article = c.split("#")[1] ?? c;
          return `gdpr-art-${article}`;
        })
        .filter((id, idx, arr) => arr.indexOf(id) === idx);

      const existing = await getCurrentAssessment(clause.id);
      const write = existing ? supersedeFact : assertFact;

      const { findingId } = await write({
        clauseId: clause.id,
        finding: {
          status: result.status,
          confidence: result.confidence,
          riskScore: result.riskScore,
          consequenceScore: result.consequenceScore,
          triageScore,
          summary: result.reasoning,
        },
        citedProvisionIds,
        deviations: result.deviations,
        derivedFromEpisodeId: episodeId,
      });

      emit({ type: "done", clauseId: clause.id, ref: clause.ref, findingId, status: result.status, triageScore });
    } catch (err) {
      emit({
        type: "error",
        clauseId: clause.id,
        ref: clause.ref,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return events;
}
