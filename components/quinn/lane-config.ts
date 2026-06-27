import type { DotTone } from "@/components/quinn/status-dot";

export type Lane = "needs_judgement" | "quick_confirm" | "auto_cleared" | "unassessed";

export const LANE_META: Record<Lane, { label: string; hint: string; dot: DotTone }> = {
  needs_judgement: {
    label: "Needs your judgement",
    hint: "Low confidence and/or high risk × consequence — your call changes the outcome.",
    dot: "attention",
  },
  quick_confirm: {
    label: "Quick confirm",
    hint: "The model is fairly confident, but worth a glance before sign-off.",
    dot: "neutral",
  },
  auto_cleared: {
    label: "Auto-cleared",
    hint: "High confidence, low risk and consequence — safe to fast-sign.",
    dot: "neutral",
  },
  unassessed: {
    label: "Not yet analyzed",
    hint: "No AI assessment on record yet.",
    dot: "unclear",
  },
};

export const STATUS_META: Record<string, { label: string; dot: DotTone }> = {
  compliant: { label: "Compliant", dot: "compliant" },
  partially_compliant: { label: "Partially compliant", dot: "partial" },
  non_compliant: { label: "Non-compliant", dot: "noncompliant" },
  unclear: { label: "Unclear", dot: "unclear" },
};

export const DECISION_META: Record<string, { label: string }> = {
  approve: { label: "Approved" },
  amend: { label: "Amended" },
  reject: { label: "Rejected" },
  escalate: { label: "Escalated" },
};
