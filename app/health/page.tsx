import { pingNeo4j } from "@/lib/neo4j";
import { pingPerplexity } from "@/lib/perplexity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <Badge variant={ok ? "default" : "destructive"}>{ok ? "Connected" : "Failed"}</Badge>
  );
}

export default async function HealthPage() {
  const [neo4j, perplexity] = await Promise.all([pingNeo4j(), pingPerplexity()]);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">System health</h1>
        <p className="text-sm text-muted-foreground">
          Live connectivity checks. No mocked status — a red badge means the real call failed.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Neo4j (case-memory graph)</CardTitle>
          <StatusBadge ok={neo4j.ok} />
        </CardHeader>
        {!neo4j.ok && (
          <CardContent>
            <p className="text-sm text-destructive">{neo4j.error}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Perplexity Agent API</CardTitle>
          <StatusBadge ok={perplexity.ok} />
        </CardHeader>
        {!perplexity.ok && (
          <CardContent>
            <p className="text-sm text-destructive">{perplexity.error}</p>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
