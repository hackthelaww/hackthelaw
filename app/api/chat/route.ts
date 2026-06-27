import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/chat/answer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.question || typeof body.question !== "string") {
    return NextResponse.json({ error: "question (string) is required" }, { status: 400 });
  }

  try {
    const result = await answerQuestion(body.question);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
