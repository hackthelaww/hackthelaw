import { NextResponse } from "next/server";
import { recordReview, type ReviewDecision } from "@/lib/graph/decide";

export const dynamic = "force-dynamic";

const VALID_DECISIONS: ReviewDecision[] = ["approve", "amend", "reject", "escalate"];

export async function POST(req: Request, ctx: RouteContext<"/api/findings/[id]/review">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);

  if (!body || !VALID_DECISIONS.includes(body.decision)) {
    return NextResponse.json(
      { error: `decision must be one of ${VALID_DECISIONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await recordReview({
      findingId: id,
      decision: body.decision,
      note: body.note ?? "",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
