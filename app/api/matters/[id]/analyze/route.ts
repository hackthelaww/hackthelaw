import { NextRequest } from "next/server";
import { analyzeMatterClauses, type AnalysisEvent } from "@/lib/agent/runAnalysis";
import { MODELS } from "@/lib/perplexity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/matters/[id]/analyze">) {
  const { id } = await ctx.params;
  const modelParam = req.nextUrl.searchParams.get("model");
  const model = modelParam === "reasoning" ? MODELS.reasoning : MODELS.fast;

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const onEvent = (event: AnalysisEvent) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        await analyzeMatterClauses(id, { model, onEvent });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "fatal", message }) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
