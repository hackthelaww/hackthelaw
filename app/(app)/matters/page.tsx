import Link from "next/link";
import { listMattersOverview, type MatterOverview } from "@/lib/graph/queries";
import { StatusDot } from "@/components/quinn/status-dot";
import { relativeTime } from "@/lib/format";
import { UploadDocumentButton } from "@/components/quinn/upload-document";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  "data-processing-agreement": "DPA",
  litigation: "Litigation",
};

export default async function ControlTowerPage() {
  let matters: MatterOverview[];
  let loadError: string | null = null;
  try {
    matters = await listMattersOverview();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    matters = [];
  }

  const totalNeedsAttention = matters.reduce((sum, m) => sum + m.needsJudgementCount, 0);
  const totalClauses = matters.reduce((sum, m) => sum + m.clauseCount, 0);
  const totalAssessed = matters.reduce((sum, m) => sum + m.assessedCount, 0);

  return (
    <main className="quinn-surface mx-auto w-full max-w-4xl px-10 py-14">
      {/* ── Header ── */}
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Matters
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Allocating your attention where human judgement changes the outcome.
          </p>
        </div>
        <UploadDocumentButton />
      </div>

      {/* ── Summary stats ── */}
      {!loadError && matters.length > 0 && (
        <div className="mb-10 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
          <div className="bg-background px-6 py-5">
            <div className="text-2xl font-light tabular-nums tracking-tight text-foreground">
              {matters.length}
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              Open matters
            </div>
          </div>
          <div className="bg-background px-6 py-5">
            <div className="text-2xl font-light tabular-nums tracking-tight text-foreground">
              {totalNeedsAttention > 0 ? (
                <span className="font-semibold">{totalNeedsAttention}</span>
              ) : (
                <span>0</span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              Need your judgement
            </div>
          </div>
          <div className="bg-background px-6 py-5">
            <div className="text-2xl font-light tabular-nums tracking-tight text-foreground">
              {totalClauses > 0
                ? `${Math.round((totalAssessed / totalClauses) * 100)}%`
                : "—"}
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              Assessed
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load matters from the graph: {loadError}. Check{" "}
          <Link href="/health" className="underline">
            system health
          </Link>
          .
        </div>
      )}

      {!loadError && matters.length === 0 && (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          No matters in the graph yet. Run <code>npm run ingest</code> to load real GDPR
          provisions, the firm playbook, and your seed matters.
        </div>
      )}

      {/* ── Matter list ── */}
      {!loadError && matters.length > 0 && (
        <div className="animate-stagger space-y-3">
          {matters.map((m) => {
            const needsAttention = m.needsJudgementCount > 0;
            const progress =
              m.clauseCount > 0
                ? Math.round((m.assessedCount / m.clauseCount) * 100)
                : 0;
            return (
              <Link
                key={m.id}
                href={`/matters/${m.id}`}
                className="group block rounded-lg border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <StatusDot
                    tone={needsAttention ? "urgent" : "outline"}
                    className="mt-2 size-2"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <span
                        className={`text-base ${
                          needsAttention
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {m.name}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {TYPE_LABELS[m.type] ?? m.type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {m.client ?? "Client not yet set"}
                    </p>

                    {/* Progress bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground/40 transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {m.assessedCount}/{m.clauseCount}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {needsAttention && (
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                        {m.needsJudgementCount} need{m.needsJudgementCount === 1 ? "s" : ""} you
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {relativeTime(m.lastUpdatedAt)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
