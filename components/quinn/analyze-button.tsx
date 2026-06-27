"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface AnalysisEvent {
  type: "start" | "done" | "error" | "fatal";
  clauseId?: string;
  ref?: string;
  heading?: string;
  findingId?: string;
  status?: string;
  triageScore?: number;
  message?: string;
}

export function AnalyzeButton({
  matterId,
  model = "fast",
  onEvent,
  onFinished,
  label = "Run analysis",
}: {
  matterId: string;
  model?: "fast" | "reasoning";
  onEvent?: (event: AnalysisEvent) => void;
  onFinished?: () => void;
  label?: string;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number | null }>({ done: 0, total: null });

  async function run() {
    setRunning(true);
    setProgress({ done: 0, total: null });
    try {
      const res = await fetch(`/api/matters/${matterId}/analyze?model=${model}`, { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error(`Analyze request failed: ${res.status} ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneCount = 0;
      let errorCount = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AnalysisEvent;
          onEvent?.(event);
          if (event.type === "done") {
            doneCount++;
            setProgress((p) => ({ done: doneCount, total: p.total }));
          }
          if (event.type === "error") {
            errorCount++;
            toast.error(`Clause ${event.ref}: ${event.message}`);
          }
          if (event.type === "fatal") {
            toast.error(`Analysis failed: ${event.message}`);
          }
        }
      }

      toast.success(
        errorCount > 0
          ? `Analysis finished with ${errorCount} error(s) — ${doneCount} clauses assessed.`
          : `Analysis complete — ${doneCount} clauses assessed.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      onFinished?.();
    }
  }

  return (
    <Button onClick={run} disabled={running} size="sm">
      {running ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Analyzing{progress.done > 0 ? ` (${progress.done})` : ""}...
        </>
      ) : (
        label
      )}
    </Button>
  );
}
