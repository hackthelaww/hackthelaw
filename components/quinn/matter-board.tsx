"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnalyzeButton, type AnalysisEvent } from "@/components/quinn/analyze-button";
import { InspectSheet } from "@/components/quinn/inspect-sheet";
import { LANE_META, STATUS_META, DECISION_META, type Lane } from "@/components/quinn/lane-config";
import { formatPercent } from "@/lib/format";
import { laneFor } from "@/lib/agent/triage";
import type { ClauseWithFinding } from "@/lib/graph/queries";

export function MatterBoard({ matterId, initialClauses }: { matterId: string; initialClauses: ClauseWithFinding[] }) {
  const router = useRouter();
  const [clauses, setClauses] = useState(initialClauses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [model, setModel] = useState<"fast" | "reasoning">("fast");

  const selected = clauses.find((c) => c.clauseId === selectedId) ?? null;

  function handleAnalysisEvent(event: AnalysisEvent) {
    if (event.type !== "done" || !event.clauseId) return;
    setClauses((prev) =>
      prev.map((c) =>
        c.clauseId === event.clauseId
          ? {
              ...c,
              findingId: event.findingId ?? c.findingId,
              status: event.status ?? c.status,
              triageScore: event.triageScore ?? c.triageScore,
              lane: laneFor(event.triageScore ?? c.triageScore ?? 0),
              latestReviewDecision: null,
            }
          : c
      )
    );
  }

  function handleDecided(clauseId: string, decision: string) {
    setClauses((prev) => prev.map((c) => (c.clauseId === clauseId ? { ...c, latestReviewDecision: decision } : c)));
    router.refresh();
  }

  const groups = useMemo(() => groupByLane(clauses), [clauses]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{clauses.length} clauses</span>
          <span>·</span>
          <span>{clauses.filter((c) => c.latestReviewDecision).length} decided</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={(v) => setModel(v as "fast" | "reasoning")}>
            <SelectTrigger size="sm" className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">perplexity/sonar</SelectItem>
              <SelectItem value="reasoning">claude-sonnet-4-6</SelectItem>
            </SelectContent>
          </Select>
          <AnalyzeButton
            matterId={matterId}
            model={model}
            onEvent={handleAnalysisEvent}
            onFinished={() => router.refresh()}
          />
        </div>
      </div>

      {(["needs_judgement", "quick_confirm", "auto_cleared", "unassessed"] as Lane[]).map((lane) => {
        const items = groups[lane];
        if (items.length === 0) return null;
        const meta = LANE_META[lane];
        return (
          <div key={lane} className="space-y-2">
            <div>
              <h2 className="text-sm font-semibold">
                {meta.label} <span className="text-muted-foreground">({items.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground">{meta.hint}</p>
            </div>
            <div className="space-y-2">
              {items.map((c) => (
                <ClauseRow key={c.clauseId} clause={c} onClick={() => setSelectedId(c.clauseId)} />
              ))}
            </div>
          </div>
        );
      })}

      <InspectSheet
        clause={selected}
        open={selectedId !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onDecided={handleDecided}
      />
    </div>
  );
}

function ClauseRow({ clause, onClick }: { clause: ClauseWithFinding; onClick: () => void }) {
  const statusMeta = clause.status ? STATUS_META[clause.status] : null;
  const decisionMeta = clause.latestReviewDecision ? DECISION_META[clause.latestReviewDecision] : null;

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={onClick}>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Clause {clause.ref}</span>
            <span className="truncate text-sm text-muted-foreground">{clause.heading}</span>
          </div>
          {clause.summary && <p className="mt-0.5 truncate text-xs text-muted-foreground">{clause.summary}</p>}
        </div>
        <div className="flex items-center gap-2">
          {decisionMeta && <Badge variant="outline">{decisionMeta.label}</Badge>}
          {statusMeta && <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>}
          {clause.confidence !== null && (
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
              {formatPercent(clause.confidence)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function groupByLane(clauses: ClauseWithFinding[]): Record<Lane, ClauseWithFinding[]> {
  const groups: Record<Lane, ClauseWithFinding[]> = {
    needs_judgement: [],
    quick_confirm: [],
    auto_cleared: [],
    unassessed: [],
  };
  for (const c of clauses) {
    groups[c.lane as Lane].push(c);
  }
  return groups;
}
