import { NextResponse } from "next/server";
import { pingNeo4j } from "@/lib/neo4j";
import { pingPerplexity } from "@/lib/perplexity";

export const dynamic = "force-dynamic";

export async function GET() {
  const [neo4j, perplexity] = await Promise.all([pingNeo4j(), pingPerplexity()]);

  const ok = neo4j.ok && perplexity.ok;

  return NextResponse.json(
    { ok, neo4j, perplexity },
    { status: ok ? 200 : 503 }
  );
}
