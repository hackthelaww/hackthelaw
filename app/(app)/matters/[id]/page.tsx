import { notFound } from "next/navigation";
import { getMatterDetail, getMatterTimeRange } from "@/lib/graph/queries";
import { MatterDetailTabs } from "@/components/quinn/matter-detail-tabs";
import { UploadDocumentButton } from "@/components/quinn/upload-document";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function getCaseBySlug(slug: string) {
  try {
    const sb = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );
    const { data } = await sb
      .from("cases")
      .select("*")
      .eq("neo4j_matter_id", slug)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMatterDetail(id);
  if (!detail) notFound();

  const { matter, parties, clauses } = detail;
  const timeRange = await getMatterTimeRange(id);
  const caseData = await getCaseBySlug(id);

  // Extract key info from AI summary or case data
  const summary = caseData?.ai_summary;
  const client = caseData?.client || matter.client;
  const jurisdiction = caseData?.jurisdiction;
  const judge = caseData?.judge;
  const caseNumber = caseData?.case_number;
  const urgency = caseData?.urgency;
  const opposingCounsel = caseData?.opposing_counsel;

  // Key parties from AI summary or graph
  const summaryParties = summary?.parties ?? [];
  const allParties = summaryParties.length > 0
    ? summaryParties
    : parties.map((p: { name: string; role: string }) => ({ name: p.name, role: p.role }));

  // Find claimant/client from extracted entities
  const clientParty = allParties.find(
    (p: { role?: string }) => p.role && /client|claimant|plaintiff/i.test(p.role)
  );
  const respondentParty = allParties.find(
    (p: { role?: string }) => p.role && /defendant|respondent|opposing/i.test(p.role)
  );

  const assessed = clauses.filter((c) => c.status !== null).length;
  const needsJudgement = clauses.filter((c) => c.lane === "needs_judgement").length;

  return (
    <main className="quinn-surface mx-auto w-full max-w-6xl flex-1 px-8 py-8">
      {/* ── Case Header ── */}
      <div className="border-b pb-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            {/* Case title */}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {matter.name}
            </h1>

            {/* Key parties — prominent display */}
            {(clientParty || respondentParty || client) && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {(clientParty || client) && (
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                      {(clientParty?.name ?? client ?? "?")[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{clientParty?.name ?? client}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {clientParty?.role ?? "Client"}
                      </div>
                    </div>
                  </div>
                )}

                {respondentParty && (
                  <>
                    <span className="text-muted-foreground text-xs">v.</span>
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold text-foreground/70">
                        {respondentParty.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{respondentParty.name}</div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {respondentParty.role}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Case metadata pills */}
            <div className="flex flex-wrap items-center gap-2">
              {urgency && urgency !== "normal" && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  urgency === "critical" ? "bg-red-500/15 text-red-600" :
                  urgency === "high" ? "bg-amber-500/15 text-amber-600" :
                  "bg-foreground/8 text-muted-foreground"
                }`}>
                  {urgency}
                </span>
              )}
              {jurisdiction && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {jurisdiction}
                </span>
              )}
              {judge && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Judge {judge}
                </span>
              )}
              {caseNumber && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {caseNumber}
                </span>
              )}
              {opposingCounsel && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Opposing: {opposingCounsel}
                </span>
              )}
            </div>

            {/* AI case description */}
            {summary && (
              <div className="max-w-2xl space-y-1.5">
                {/* Key facts — show up to 3 */}
                {summary.key_facts && summary.key_facts.length > 0 && (
                  <div className="space-y-1">
                    {summary.key_facts.slice(0, 3).map((fact: string, i: number) => (
                      <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                        {fact}
                      </p>
                    ))}
                  </div>
                )}

                {/* Risks summary */}
                {summary.risks && summary.risks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {summary.risks.slice(0, 3).map((risk: { description: string; severity: string }, i: number) => (
                      <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        risk.severity === "critical" || risk.severity === "high"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-amber-500/10 text-amber-600"
                      }`}>
                        {risk.description.length > 60 ? risk.description.slice(0, 60) + "..." : risk.description}
                      </span>
                    ))}
                  </div>
                )}

                {/* Timeline highlights */}
                {summary.timeline && summary.timeline.length > 0 && (
                  <p className="text-xs text-muted-foreground/70 pt-0.5">
                    Timeline: {summary.timeline.slice(0, 3).map((t: { date: string; event: string }) =>
                      `${t.date} — ${t.event}`
                    ).join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Upload button */}
          <div className="shrink-0 ml-4">
            <UploadDocumentButton matterId={matter.id} />
          </div>
        </div>
      </div>

      {/* ── Tabs & content ── */}
      <div className="mt-6">
        <MatterDetailTabs
          matterId={matter.id}
          initialClauses={clauses}
          timeRange={timeRange}
        />
      </div>
    </main>
  );
}
