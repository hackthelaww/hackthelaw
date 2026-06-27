import Link from "next/link";
import { listMattersOverview, type MatterOverview } from "@/lib/graph/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quinn</h1>
        <p className="text-sm text-muted-foreground">
          Allocating your attention to the AI outputs where your judgement changes the outcome.
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            Could not load matters from the graph: {loadError}. Check{" "}
            <Link href="/health" className="underline">
              system health
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {!loadError && matters.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No matters in the graph yet. Run <code>npm run ingest</code> to load real GDPR
            provisions, the firm playbook, and your seed matters.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {matters.map((m) => {
          const needsAttention = m.needsJudgementCount > 0;
          return (
            <Link key={m.id} href={`/matters/${m.id}`}>
              <Card
                className={
                  needsAttention
                    ? "border-amber-400 bg-amber-50/60 transition-colors hover:bg-amber-50 dark:bg-amber-950/20"
                    : "transition-colors hover:bg-muted/40"
                }
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{m.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {m.client ?? "Client not yet set"} · {TYPE_LABELS[m.type] ?? m.type}
                    </p>
                  </div>
                  {needsAttention ? (
                    <Badge className="border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                      {m.needsJudgementCount} need{m.needsJudgementCount === 1 ? "s" : ""} you
                    </Badge>
                  ) : m.assessedCount > 0 ? (
                    <Badge variant="secondary">All clear</Badge>
                  ) : (
                    <Badge variant="outline">Not yet analyzed</Badge>
                  )}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {m.assessedCount}/{m.clauseCount} clauses assessed
                  </span>
                  <span>Updated {relativeTime(m.lastUpdatedAt)}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
