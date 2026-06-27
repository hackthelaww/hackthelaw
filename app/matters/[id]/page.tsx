import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatterDetail } from "@/lib/graph/queries";
import { MatterBoard } from "@/components/quinn/matter-board";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMatterDetail(id);
  if (!detail) notFound();

  const { matter, parties, clauses } = detail;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-8">
      <div>
        <Link href="/" className="text-xs text-muted-foreground underline underline-offset-4">
          ← Control tower
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{matter.name}</h1>
        <p className="text-sm text-muted-foreground">
          {matter.client ?? "Client not yet set"} · {matter.type} · {matter.status}
        </p>
        {parties.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {parties.map((p) => (
              <Badge key={p.id} variant="outline">
                {p.role}: {p.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <MatterBoard matterId={matter.id} initialClauses={clauses} />
    </main>
  );
}
