import Link from "next/link";
import { listMattersOverview, type MatterOverview } from "@/lib/graph/queries";
import { StatusDot } from "@/components/quinn/status-dot";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  "data-processing-agreement": "Data processing agreement",
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

  return (
    <main className="mx-auto w-full max-w-3xl px-10 py-12">
      <div className="mb-10">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Matters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Allocating your attention to the AI outputs where your judgement changes the outcome.
        </p>
      </div>

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

      {!loadError && matters.length > 0 && (
        <>
          <div className="mb-1 flex items-baseline justify-between border-b pb-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>
              {matters.length} open matter{matters.length === 1 ? "" : "s"}
              {totalNeedsAttention > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-semibold text-foreground">
                    {totalNeedsAttention} item{totalNeedsAttention === 1 ? "" : "s"} need you
                  </span>
                </>
              )}
            </span>
            <span>Updated</span>
          </div>

          <ul>
            {matters.map((m) => {
              const needsAttention = m.needsJudgementCount > 0;
              return (
                <li key={m.id} className="border-b">
                  <Link
                    href={`/matters/${m.id}`}
                    className="flex items-center gap-4 py-4 transition-colors hover:bg-muted/40"
                  >
                    <StatusDot tone={needsAttention ? "urgent" : "outline"} className="size-2 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={needsAttention ? "font-semibold text-foreground" : "text-foreground"}>
                          {m.name}
                        </span>
                        {needsAttention && (
                          <span className="text-xs font-medium text-foreground">
                            {m.needsJudgementCount} need{m.needsJudgementCount === 1 ? "s" : ""} you
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {m.client ?? "Client not yet set"} · {TYPE_LABELS[m.type] ?? m.type}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {m.assessedCount}/{m.clauseCount} assessed
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {relativeTime(m.lastUpdatedAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
