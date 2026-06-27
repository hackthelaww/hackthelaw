import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getMatterDetail, getMatterEntitySummary } from "@/lib/graph/queries";
import { queryRecentChanges, type ChangeEntry } from "@/lib/chat/tools";
import { completeStream } from "@/lib/perplexity";

export const dynamic = "force-dynamic";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

function renderChanges(changes: ChangeEntry[], isFirstVisit: boolean): string {
  if (isFirstVisit) return "This is your first visit to this matter.";
  if (changes.length === 0) return "No changes since your last visit.";
  return changes
    .slice(0, 10)
    .map((c) => `- Clause ${c.ref} (${c.heading}) moved from "${c.fromStatus ?? "unassessed"}" to "${c.toStatus}".`)
    .join("\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matterId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [detail, entitySummary] = await Promise.all([
    getMatterDetail(matterId),
    getMatterEntitySummary(matterId),
  ]);
  if (!detail) {
    return NextResponse.json({ error: "Matter not found" }, { status: 404 });
  }
  const { matter, clauses } = detail;

  const sb = serviceClient();

  const { data: visitRow } = await sb
    .from("matter_visits")
    .select("last_viewed_at")
    .eq("user_id", user.id)
    .eq("matter_id", matterId)
    .maybeSingle();

  const previousVisit: Date | null = visitRow?.last_viewed_at
    ? new Date(visitRow.last_viewed_at)
    : null;
  const isFirstVisit = previousVisit === null;

  await sb
    .from("matter_visits")
    .upsert(
      { user_id: user.id, matter_id: matterId, last_viewed_at: new Date().toISOString() },
      { onConflict: "user_id,matter_id" }
    );

  const changes = isFirstVisit
    ? []
    : (await queryRecentChanges(previousVisit!.getTime(), matterId)).hits;

  const needsJudgement = clauses.filter((c) => c.lane === "needs_judgement");
  const assessed = clauses.filter((c) => c.status !== null).length;

  const statusLines = [
    clauses.length > 0
      ? `${clauses.length} total clauses, ${assessed} assessed. ${
          needsJudgement.length > 0
            ? `${needsJudgement.length} clause(s) need judgement: ${needsJudgement.slice(0, 6).map((c) => c.ref).join(", ")}.`
            : "No clauses currently need judgement."
        }`
      : null,
    entitySummary.total > 0
      ? `${entitySummary.total} fact(s) extracted from documents: ${Object.entries(entitySummary.byType)
          .map(([type, count]) => `${count} ${type}`)
          .join(", ")}.`
      : null,
    clauses.length === 0 && entitySummary.total === 0 ? "No documents have been processed for this matter yet." : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are Quinn, drafting a short "welcome back" overview directly to the partner who is
reopening this matter. Address them as "you" — never as "the partner" or in the third person. Use ONLY
the facts below — never invent a fact, name, or number that isn't given. Write 3-5 short bullet points,
each on its own line starting with "• " (a bullet character, not a hyphen), covering, in order: (1) what
changed since your last visit and when the last document was uploaded (also name the document name and who uploaded it including a link to the document), (2) the current phase of the matter (e.g. pre-litigation, pleadings, discovery, pretrial motions, and trial), (3) what needs to be done next. If a category has
nothing to report, say so plainly in one short bullet rather than skipping it silently. Keep the whole
thing under 80 words.

MATTER: ${matter.name}

CHANGES SINCE LAST VISIT:
${renderChanges(changes, isFirstVisit)}

CURRENT STATUS:
${statusLines}`;

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of completeStream(prompt, { maxOutputTokens: 300 })) {
          if (cancelled) break;
          controller.enqueue(encoder.encode(JSON.stringify({ type: "delta", text: delta }) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "fatal", message }) + "\n"));
      } finally {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
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
