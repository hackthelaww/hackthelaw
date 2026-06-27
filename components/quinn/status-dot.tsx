import { cn } from "@/lib/utils";

export type DotTone = "attention" | "compliant" | "partial" | "noncompliant" | "unclear" | "neutral";

const TONE_CLASS: Record<DotTone, string> = {
  attention: "bg-attention",
  compliant: "bg-status-compliant",
  partial: "bg-status-partial",
  noncompliant: "bg-status-noncompliant",
  unclear: "bg-status-unclear",
  neutral: "bg-muted-foreground/40",
};

export function StatusDot({ tone, className }: { tone: DotTone; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", TONE_CLASS[tone], className)} />;
}
