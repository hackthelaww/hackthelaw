import { cn } from "@/lib/utils";

export type DotTone = "urgent" | "set" | "outline";

const TONE_CLASS: Record<DotTone, string> = {
  urgent: "bg-foreground",
  set: "bg-muted-foreground",
  outline: "border border-muted-foreground/50 bg-transparent",
};

export function StatusDot({ tone, className }: { tone: DotTone; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", TONE_CLASS[tone], className)} />;
}
