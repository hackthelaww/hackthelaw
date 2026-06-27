import { notFound } from "next/navigation";
import { getMatterDetail, getMatterTimeRange } from "@/lib/graph/queries";
import { MatterDetailTabs } from "@/components/quinn/matter-detail-tabs";
import { UploadDocumentButton } from "@/components/quinn/upload-document";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  "data-processing-agreement": "DPA",
  litigation: "Litigation",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  in_review: "In review",
};

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMatterDetail(id);
  if (!detail) notFound();

  const { matter, parties, clauses } = detail;
  const timeRange = await getMatterTimeRange(id);

  const assessed = clauses.filter((c) => c.status !== null).length;
  const needsJudgement = clauses.filter((c) => c.lane === "needs_judgement").length;

  return (
    <main className="quinn-surface mx-auto w-full max-w-6xl flex-1 px-8 py-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between border-b pb-6">
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {matter.name}
            </h1>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {TYPE_LABELS[matter.type] ?? matter.type}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {STATUS_LABELS[matter.status] ?? matter.status}
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            {matter.client ?? "Client not yet set"}
          </p>

          {/* Party badges */}
          {parties.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {parties.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                >
                  <div className="monogram size-4 bg-foreground/10 text-[8px] text-foreground">
                    {p.name[0]}
                  </div>
                  <span className="text-muted-foreground">{p.role}:</span>
                  <span className="font-medium text-foreground">{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Quick stats */}
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-lg font-light tabular-nums text-foreground">{clauses.length}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Clauses</div>
            </div>
            <div className="w-px bg-border" />
            <div>
              <div className="text-lg font-light tabular-nums text-foreground">{assessed}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Assessed</div>
            </div>
            {needsJudgement > 0 && (
              <>
                <div className="w-px bg-border" />
                <div>
                  <div className="text-lg font-semibold tabular-nums text-foreground">{needsJudgement}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Need you</div>
                </div>
              </>
            )}
          </div>
          <UploadDocumentButton matterId={matter.id} />
        </div>
      </div>

      {/* ── Tabs & content ── */}
      <div className="mt-6">
        <MatterDetailTabs
          matterId={matter.id}
          initialClauses={clauses}
          timeRange={timeRange}
        />
      </div>
    </main>
  );
}
