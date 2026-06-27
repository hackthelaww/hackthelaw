import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { runRead } from "@/lib/neo4j";
import { writeEpisode, mentions } from "@/lib/graph/ingestWriters";
import { supersedeFact, getCurrentAssessment } from "@/lib/graph/temporal";
import { computeTriageScore } from "@/lib/agent/triage";
import { retrieveProvisions, retrieveAllPlaybookRules } from "@/lib/agent/retrieve";
import { analyzeClause } from "@/lib/agent/analyze";
import { MODELS } from "@/lib/perplexity";

const ROOT = process.cwd();
const CANDIDATE_FILES = ["data/subprocessor-update.md", "data/subprocessor-update.txt"];

export function findNewInformationFile(): string | null {
  for (const candidate of CANDIDATE_FILES) {
    if (existsSync(resolve(ROOT, candidate))) return candidate;
  }
  return null;
}

export interface NewInformationResult {
  documentEpisodeId: string;
  agentEpisodeId: string;
  findingId: string;
  previousStatus: string | null;
  newStatus: string;
  triageScore: number;
}

/**
 * The Phase 5 "new information arrives" beat: ingest a real document as its
 * own Episode, re-run analysis for one clause with that document's text in
 * context, and supersede the clause's current fact — closing the old window,
 * not deleting it. Both the document episode and the re-analysis episode are
 * linked to the new Finding so the inspect panel can show what triggered it.
 */
export async function applyNewInformation(clauseId: string, opts: { model?: string } = {}): Promise<NewInformationResult> {
  const sourceFile = findNewInformationFile();
  if (!sourceFile) {
    throw new Error(
      `No new-information document found (expected ${CANDIDATE_FILES.join(" or ")}). Drop a real file in to run this.`
    );
  }

  const records = await runRead(
    `MATCH (c:Clause {id: $clauseId}) RETURN c.ref AS ref, c.heading AS heading, c.text AS text`,
    { clauseId }
  );
  if (records.length === 0) {
    throw new Error(`No clause with id ${clauseId}`);
  }
  const clause = {
    ref: records[0].get("ref") as string,
    heading: records[0].get("heading") as string,
    text: records[0].get("text") as string,
  };

  const documentText = readFileSync(resolve(ROOT, sourceFile), "utf-8");

  const documentEpisodeId = await writeEpisode({
    kind: "DOCUMENT_INGESTED",
    label: `New information ingested: ${sourceFile}`,
    payloadRef: sourceFile,
  });
  await mentions(documentEpisodeId, "Clause", clauseId);

  const previous = await getCurrentAssessment(clauseId);

  const provisions = await retrieveProvisions(`${clause.text}\n${documentText}`);
  const rules = await retrieveAllPlaybookRules();
  const model = opts.model ?? MODELS.fast;
  const result = await analyzeClause(clause, provisions, rules, { model, additionalContext: documentText });
  const triageScore = computeTriageScore(result);

  const agentEpisodeId = await writeEpisode({
    kind: "AGENT_ACTION",
    label: `Clause ${clause.ref} re-analyzed by ${model} after new information landed`,
    payloadRef: clauseId,
  });

  const citedProvisionIds = result.citedProvisions
    .map((c) => `gdpr-art-${c.split("#")[1] ?? c}`)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);

  const { findingId } = await supersedeFact({
    clauseId,
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
    derivedFromEpisodeId: [documentEpisodeId, agentEpisodeId],
  });

  return {
    documentEpisodeId,
    agentEpisodeId,
    findingId,
    previousStatus: previous?.status ?? null,
    newStatus: result.status,
    triageScore,
  };
}
