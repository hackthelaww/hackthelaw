export interface TriageInputs {
  confidence: number; // 0..1, the model's confidence in its own assessment
  riskScore: number; // 0..1, severity if the assessment is wrong / the deviation is real
  consequenceScore: number; // 0..1, how bad the downstream impact is if missed
}

/**
 * Triage score = a weighted blend of "the model isn't sure" (1 - confidence),
 * "this is risky if wrong" (riskScore), and "the blast radius is large"
 * (consequenceScore). Weights sum to 1 and were picked so that low confidence
 * alone is enough to surface a clause, while risk and consequence together can
 * also surface a clause the model is confident about (e.g. confidently
 * non-compliant on something with severe downstream impact).
 */
const WEIGHTS = {
  uncertainty: 0.4,
  risk: 0.35,
  consequence: 0.25,
} as const;

export function computeTriageScore({ confidence, riskScore, consequenceScore }: TriageInputs): number {
  const uncertainty = 1 - clamp01(confidence);
  const score =
    uncertainty * WEIGHTS.uncertainty + clamp01(riskScore) * WEIGHTS.risk + clamp01(consequenceScore) * WEIGHTS.consequence;
  return clamp01(score);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export const TRIAGE_LANES = {
  needsJudgement: 0.6,
  quickConfirm: 0.3,
} as const;

export type TriageLane = "needs_judgement" | "quick_confirm" | "auto_cleared";

export function laneFor(triageScore: number): TriageLane {
  if (triageScore >= TRIAGE_LANES.needsJudgement) return "needs_judgement";
  if (triageScore >= TRIAGE_LANES.quickConfirm) return "quick_confirm";
  return "auto_cleared";
}
