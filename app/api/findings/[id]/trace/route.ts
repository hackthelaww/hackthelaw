import { NextResponse } from "next/server";
import { traceFinding } from "@/lib/graph/temporal";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/findings/[id]/trace">) {
  const { id } = await ctx.params;
  const trace = await traceFinding(id);
  if (!trace.finding) {
    return NextResponse.json({ error: `No finding with id ${id}` }, { status: 404 });
  }
  return NextResponse.json(trace);
}
