import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getMatterDetail } from "@/lib/graph/queries";
import { queryRecentChanges, type ChangeEntry } from "@/lib/chat/tools";
import { complete } from "@/lib/perplexity";

export const dynamic = "force-dynamic";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

function renderChanges(changes: ChangeEntry[], isFirstVisit: boolean): string {
  if (isFirstVisit) return "This is the partner's first visit to this matter.";
  if (changes.length === 0) return "No changes since the partner's last visit.";
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

  const detail = await getMatterDetail(matterId);
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
    `${clauses.length} total clauses, ${assessed} assessed.`,
    needsJudgement.length > 0
      ? `${needsJudgement.length} clause(s) need judgement: ${needsJudgement
          .slice(0, 6)
          .map((c) => c.ref)
          .join(", ")}.`
      : "No clauses currently need judgement.",
  ].join("\n");

  const name = user.email ? user.email.split("@")[0] : "there";

  const prompt = `You are Quinn, drafting a short "welcome back" overview for a partner re-opening a matter
in a legal AI supervision tool. Use ONLY the facts below — never invent a fact, name, or number that
isn't given. Write 3-5 short bullet points (markdown "-" bullets) covering, in order: (1) what changed
since the partner's last visit, (2) the current status, (3) what needs to be done next. If a category has
nothing to report, say so plainly in one short bullet rather than skipping it silently. Keep the whole
thing under 80 words.

MATTER: ${matter.name}

CHANGES SINCE LAST VISIT:
${renderChanges(changes, isFirstVisit)}

CURRENT STATUS:
${statusLines}`;

  const summary = await complete(prompt, { maxOutputTokens: 300 });

  return NextResponse.json({
    name,
    isFirstVisit,
    previousVisit: previousVisit?.toISOString() ?? null,
    summary,
  });
}
