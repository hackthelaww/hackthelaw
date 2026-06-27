import { NextResponse } from "next/server";
import { runRead } from "@/lib/neo4j";
import { researchClause } from "@/lib/agent/research";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: RouteContext<"/api/clauses/[id]/research">) {
  const { id } = await ctx.params;

  const records = await runRead(
    `MATCH (c:Clause {id: $id}) RETURN c.ref AS ref, c.heading AS heading, c.text AS text`,
    { id }
  );
  if (records.length === 0) {
    return NextResponse.json({ error: `No clause with id ${id}` }, { status: 404 });
  }

  const clause = {
    id,
    ref: records[0].get("ref"),
    heading: records[0].get("heading"),
    text: records[0].get("text"),
  };

  try {
    const result = await researchClause(clause);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
