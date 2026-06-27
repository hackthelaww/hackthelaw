import { notFound } from "next/navigation";
import { getMatterDetail, getMatterTimeRange } from "@/lib/graph/queries";
import { MatterBoard } from "@/components/quinn/matter-board";

export const dynamic = "force-dynamic";

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMatterDetail(id);
  if (!detail) notFound();

  const { matter, parties, clauses } = detail;
  const timeRange = await getMatterTimeRange(id);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-8 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{matter.name}</h1>
        <p className="text-sm text-muted-foreground">
          {matter.client ?? "Client not yet set"} · {matter.type} · {matter.status}
        </p>
        {parties.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {parties.map((p) => (
              <span key={p.id}>
                {p.role}: {p.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <MatterBoard matterId={matter.id} initialClauses={clauses} timeRange={timeRange} />
    </main>
  );
}
