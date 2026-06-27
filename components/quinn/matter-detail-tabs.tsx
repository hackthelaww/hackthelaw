"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityList } from "@/components/quinn/entity-list";
import { MatterBoard } from "@/components/quinn/matter-board";
import { CaseTimeline } from "@/components/quinn/case-timeline";
import { MatterOverview } from "@/components/quinn/matter-overview";
import { CaseIntelligence } from "@/components/quinn/case-intelligence";
import type { ClauseWithFinding, MatterTimeRange } from "@/lib/graph/queries";

const BackendGraph = dynamic(
  () => import("@/components/quinn/backend-graph").then((m) => m.BackendGraph),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Loading graph...
      </div>
    ),
  }
);

type Tab = "timeline" | "overview" | "intelligence" | "entities" | "graph" | "clauses";

export function MatterDetailTabs({
  matterId,
  initialClauses,
  timeRange,
}: {
  matterId: string;
  initialClauses: ClauseWithFinding[];
  timeRange: MatterTimeRange;
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  const hasClauses = initialClauses.length > 0;

  const tabCounts = useMemo(() => {
    const needsJudgement = initialClauses.filter((c) => c.lane === "needs_judgement").length;
    return { clauses: initialClauses.length, needsJudgement };
  }, [initialClauses]);

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="timeline">
            Timeline
          </TabsTrigger>
          <TabsTrigger value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="intelligence">
            Intelligence
          </TabsTrigger>
          <TabsTrigger value="entities">
            Entities
          </TabsTrigger>
          <TabsTrigger value="graph">
            Graph
          </TabsTrigger>
          {hasClauses && (
            <TabsTrigger value="clauses">
              Clauses
              {tabCounts.needsJudgement > 0 && (
                <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold tabular-nums text-background">
                  {tabCounts.needsJudgement}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {tab === "overview" && <MatterOverview matterId={matterId} />}

      {tab === "intelligence" && <CaseIntelligence matterId={matterId} />}

      {tab === "timeline" && <CaseTimeline matterId={matterId} />}

      {tab === "entities" && <EntityList matterId={matterId} />}

      {tab === "graph" && (
        <div className="h-[600px] overflow-hidden rounded-lg border">
          <BackendGraph matterId={matterId} />
        </div>
      )}

      {tab === "clauses" && hasClauses && (
        <MatterBoard matterId={matterId} initialClauses={initialClauses} timeRange={timeRange} />
      )}
    </div>
  );
}
