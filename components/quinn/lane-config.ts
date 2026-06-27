export type Lane = "needs_judgement" | "quick_confirm" | "auto_cleared" | "unassessed";

export const LANE_META: Record<Lane, { label: string; hint: string; badgeClass: string }> = {
  needs_judgement: {
    label: "Needs your judgement",
    hint: "Low confidence and/or high risk × consequence — your call changes the outcome.",
    badgeClass: "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  },
  quick_confirm: {
    label: "Quick confirm",
    hint: "The model is fairly confident, but worth a glance before sign-off.",
    badgeClass: "border-sky-500 bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  },
  auto_cleared: {
    label: "Auto-cleared",
    hint: "High confidence, low risk and consequence — safe to fast-sign.",
    badgeClass: "border-emerald-500 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  unassessed: {
    label: "Not yet analyzed",
    hint: "No AI assessment on record yet.",
    badgeClass: "border-zinc-400 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

export const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  compliant: { label: "Compliant", badgeClass: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" },
  partially_compliant: { label: "Partially compliant", badgeClass: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  non_compliant: { label: "Non-compliant", badgeClass: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
  unclear: { label: "Unclear", badgeClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export const DECISION_META: Record<string, { label: string }> = {
  approve: { label: "Approved" },
  amend: { label: "Amended" },
  reject: { label: "Rejected" },
  escalate: { label: "Escalated" },
};
