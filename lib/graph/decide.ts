import { randomUUID } from "crypto";
import { runWrite } from "@/lib/neo4j";
import { now } from "@/lib/graph/ingestWriters";

export type ReviewDecision = "approve" | "amend" | "reject" | "escalate";

export const REVIEWER_NAME = "Supervising partner";

export interface RecordReviewInput {
  findingId: string;
  decision: ReviewDecision;
  note: string;
  reviewer?: string;
}

export interface RecordReviewResult {
  reviewId: string;
  signOffId: string | null;
  at: number;
}

/**
 * Approve / Amend / Reject / Escalate all write a Review attesting to a
 * specific decision on a specific Finding. Approve additionally writes a
 * SignOff. Amend also rewrites the Finding's summary in place (a human
 * correction of phrasing, not a new temporal fact — the underlying
 * compliance assessment isn't re-derived, so this doesn't go through
 * assertFact/supersedeFact).
 */
export async function recordReview(input: RecordReviewInput): Promise<RecordReviewResult> {
  const at = now();
  const reviewId = randomUUID();
  const reviewer = input.reviewer ?? REVIEWER_NAME;

  await runWrite(
    `MATCH (f:Finding {id: $findingId})
     CREATE (rev:Review {id: $reviewId, decision: $decision, note: $note, reviewer: $reviewer, at: $at})
     CREATE (rev)-[:OF]->(f)`,
    { findingId: input.findingId, reviewId, decision: input.decision, note: input.note, reviewer, at }
  );

  if (input.decision === "amend" && input.note.trim()) {
    await runWrite(`MATCH (f:Finding {id: $findingId}) SET f.summary = $note`, {
      findingId: input.findingId,
      note: input.note,
    });
  }

  let signOffId: string | null = null;
  if (input.decision === "approve") {
    signOffId = randomUUID();
    await runWrite(
      `MATCH (f:Finding {id: $findingId})
       CREATE (so:SignOff {id: $signOffId, attestation: $attestation, signer: $signer, at: $at})
       CREATE (so)-[:ATTESTS]->(f)`,
      {
        findingId: input.findingId,
        signOffId,
        attestation: "Reviewed and approved as an accurate assessment of this clause.",
        signer: reviewer,
        at,
      }
    );
  }

  return { reviewId, signOffId, at };
}
