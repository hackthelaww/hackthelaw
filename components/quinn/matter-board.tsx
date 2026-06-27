"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyzeButton, type AnalysisEvent } from "@/components/quinn/analyze-button";
import { ClauseDetailPanel } from "@/components/quinn/clause-detail-panel";
import { TimeScrubber, type SnapshotEntry } from "@/components/quinn/time-scrubber";
import { NewInformationButton } from "@/components/quinn/new-information-button";
import { StatusDot } from "@/components/quinn/status-dot";
import { LANE_META, STATUS_META, DECISION_META, type Lane } from "@/components/quinn/lane-config";
import { formatPercent } from "@/lib/format";
import { laneFor } from "@/lib/agent/triage";
import type { ClauseWithFinding } from "@/lib/graph/queries";
import type { MatterTimeRange } from "@/lib/graph/queries";

const LANE_ORDER: Lane[] = ["needs_judgement", "quick_confirm", "auto_cleared", "unassessed"];

// NVL's base library touches `document` at import time, which breaks Next's
// SSR pass for client components — load it in the browser only.
const MatterGraph = dynamic(() => import("@/components/quinn/matter-graph").then((m) => m.MatterGraph), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading graph…</div>
  ),
});

function pickDefaultSelection(clauses: ClauseWithFinding[]): string | null {
  for (const lane of LANE_ORDER) {
    const hit = clauses.find((c) => c.lane === lane);
    if (hit) return hit.clauseId;
  }
  return null;
}

export function MatterBoard({
  matterId,
  initialClauses,
  timeRange,
}: {
  matterId: string;
  initialClauses: ClauseWithFinding[];
  timeRange: MatterTimeRange;
}) {
  const router = useRouter();
  const [clauses, setClauses] = useState(initialClauses);
  const [selectedId, setSelectedId] = useState<string | null>(() => pickDefaultSelection(initialClauses));
  const [model, setModel] = useState<"fast" | "reasoning">("fast");
  const [historical, setHistorical] = useState<{ entries: SnapshotEntry[]; viewingAt: number } | null>(null);
  const [view, setView] = useState<"list" | "graph">("list");
  const [liveGraphAt, setLiveGraphAt] = useState(() => Date.now());

  const displayClauses = useMemo(
    () => (historical ? applyHistoricalOverride(clauses, historical.entries) : clauses),
    [clauses, historical]
  );

  const selected = displayClauses.find((c) => c.clauseId === selectedId) ?? null;

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
    setLiveGraphAt(Date.now());
  }

  function handleDecided(clauseId: string, decision: string) {
    setClauses((prev) => prev.map((c) => (c.clauseId === clauseId ? { ...c, latestReviewDecision: decision } : c)));
    setLiveGraphAt(Date.now());
    router.refresh();
  }

  function handleNewInformationApplied(clauseId: string, newStatus: string) {
    router.refresh();
    setClauses((prev) =>
      prev.map((c) => (c.clauseId === clauseId ? { ...c, status: newStatus, latestReviewDecision: null } : c))
    );
    setLiveGraphAt(Date.now());
  }

  const groups = useMemo(() => groupByLane(displayClauses), [displayClauses]);
  const isLive = historical === null;
  const hasHistory = timeRange.earliest !== null && timeRange.latest !== null;

  return (
    <div className="space-y-4">
      {hasHistory && (
        <TimeScrubber
          matterId={matterId}
          minT={timeRange.earliest as number}
          maxT={timeRange.latest as number}
          onSnapshot={(entries, viewingAt) =>
            setHistorical(entries && viewingAt !== null ? { entries, viewingAt } : null)
          }
        />
      )}

      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {clauses.length} clauses · {clauses.filter((c) => c.latestReviewDecision).length} decided
          </span>
          <Tabs
            value={view}
            onValueChange={(v) => {
              const next = (v ?? "list") as "list" | "graph";
              setView(next);
              if (next === "graph") setLiveGraphAt(Date.now());
            }}
          >
            <TabsList variant="line">
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="graph">Graph</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {isLive && (
          <div className="flex items-center gap-1">
            <NewInformationButton matterId={matterId} clauses={clauses} onApplied={handleNewInformationApplied} />
            <Select value={model} onValueChange={(v) => setModel((v ?? "fast") as "fast" | "reasoning")}>
              <SelectTrigger size="sm" className="w-auto border-none text-xs text-muted-foreground shadow-none">
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
        )}
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="lg:w-[420px] lg:flex-shrink-0">
            {LANE_ORDER.map((lane) => {
              const items = groups[lane];
              if (items.length === 0) return null;
              const meta = LANE_META[lane];
              return (
                <div
                  key={lane}
                  className={lane === "needs_judgement" ? "border-l-2 border-foreground pl-3" : "pl-3"}
                >
                  <div className="pt-4 pb-1">
                    <h2
                      className={
                        lane === "needs_judgement"
                          ? "text-base font-semibold text-foreground"
                          : "text-base font-medium text-foreground"
                      }
                    >
                      {meta.label} <span className="font-normal text-sm text-muted-foreground">({items.length})</span>
                    </h2>
                    <p className="text-xs text-muted-foreground">{meta.hint}</p>
                  </div>
                  <div>
                    {items.map((c) => (
                      <ClauseRow
                        key={c.clauseId}
                        clause={c}
                        selected={c.clauseId === selectedId}
                        onClick={() => setSelectedId(c.clauseId)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="min-h-[480px] flex-1 lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)] lg:border-l lg:pl-6">
            <ClauseDetailPanel clause={selected} onDecided={handleDecided} readOnly={!isLive} />
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-12rem)] border-t">
          <MatterGraph matterId={matterId} viewingAt={historical?.viewingAt ?? liveGraphAt} />
        </div>
      )}
    </div>
  );
}

function ClauseRow({
  clause,
  selected,
  onClick,
}: {
  clause: ClauseWithFinding;
  selected: boolean;
  onClick: () => void;
}) {
  const statusMeta = clause.status ? STATUS_META[clause.status] : null;
  const decisionMeta = clause.latestReviewDecision ? DECISION_META[clause.latestReviewDecision] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b py-3 text-left transition-colors hover:bg-muted/40 ${
        selected ? "bg-muted/60" : ""
      }`}
    >
      <StatusDot tone={statusMeta?.dot ?? "outline"} />
      <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {clause.ref}
      </span>
      <div className="min-w-0 flex-1">
        <span className={`truncate text-sm text-foreground ${statusMeta?.dot === "urgent" ? "font-semibold" : ""}`}>
          {clause.heading}
        </span>
        {decisionMeta && <span className="ml-2 text-xs text-muted-foreground">{decisionMeta.label}</span>}
      </div>
      {clause.confidence !== null && (
        <span className="shrink-0 text-xs text-muted-foreground">{formatPercent(clause.confidence)}</span>
      )}
    </button>
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

function applyHistoricalOverride(clauses: ClauseWithFinding[], entries: SnapshotEntry[]): ClauseWithFinding[] {
  const byClause = new Map(entries.map((e) => [e.clauseId, e]));
  return clauses.map((c) => {
    const entry = byClause.get(c.clauseId);
    if (!entry) {
      return { ...c, findingId: null, status: null, summary: "Not yet assessed as of this time.", lane: "unassessed" as const };
    }
    return {
      ...c,
      findingId: entry.findingId,
      status: entry.status,
      summary: entry.summary,
      triageScore: entry.triageScore,
      lane: laneFor(entry.triageScore),
      latestReviewDecision: null,
    };
  });
}
