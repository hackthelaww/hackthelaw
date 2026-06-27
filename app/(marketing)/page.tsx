import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    title: "Control tower",
    body:
      "Matters listed as cards; any matter with clauses in the \"needs your judgement\" lane shows an amber badge.",
  },
  {
    title: "Matter view",
    body:
      "Click into a matter, run analysis, and watch clauses get assessed live, then sorted into three lanes by triage score.",
  },
  {
    title: "Inspect",
    body:
      "Open a clause to see the reasoning, the actual GDPR article text it relied on, any firm-playbook deviation, and the confidence/risk/consequence breakdown.",
  },
  {
    title: "Decide",
    body:
      "Approve, amend, reject, or escalate. Each writes a real Review (and a SignOff on approve) to the graph; the lane and badge update immediately.",
  },
  {
    title: "New information arrives",
    body:
      "Ingest a real update document for one clause and watch it re-assess — flipping status if the new information actually contradicts the prior belief.",
  },
  {
    title: "Time-scrub",
    body:
      "Drag the scrubber on the matter page to see the clause's status at each point in time, with the old fact's window closed, not deleted.",
  },
  {
    title: "Ask Quinn",
    body:
      "“Which clauses rely on GDPR Article 28?” — answered from real graph traversals, with citations back to the nodes used.",
  },
];

const PROOF_POINTS = [
  {
    label: "Real GDPR text",
    body: "Pulled live from EUR-Lex's official consolidated text, not paraphrased.",
  },
  {
    label: "Real model calls",
    body: "Clause analysis and chat run on Perplexity's Agent API, not canned responses.",
  },
  {
    label: "Real graph writes",
    body: "Every review and sign-off lands in the bi-temporal case-memory graph at the moment work happens.",
  },
];

const STACK = ["Next.js", "Neo4j", "Perplexity Agent API", "EUR-Lex"];

export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-10 py-24">
      {/* ── Hero ── */}
      <section className="border-b pb-16">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Supervision layer for human–AI legal teams
        </span>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-foreground">
          Quinn
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Quinn triages AI review output by confidence × risk × consequence, lets a
          partner inspect the real reasoning and real sources behind each finding, and
          records every decision — and every change of belief over time — in a
          bi-temporal case-memory graph.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Button size="lg" render={<Link href="/matters" />}>
            Enter the control tower
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/health" />}>
            Check system health
          </Button>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-b py-16">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          How it works
        </span>
        <div className="animate-stagger mt-6 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-lg border bg-card p-5">
              <div className="flex items-start gap-4">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Credibility ── */}
      <section className="border-b py-16">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Everything in this app is live
        </span>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          The only authored content is the firm&apos;s own playbook — the firm&apos;s
          standards, not legal advice or case material. If an external API can&apos;t be
          reached, the UI shows the real error; it never falls back to fake data.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          {PROOF_POINTS.map((point) => (
            <div key={point.label} className="bg-background px-6 py-5">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {point.label}
              </div>
              <p className="mt-1 text-sm text-foreground">{point.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stack ── */}
      <section className="py-16">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Built on
        </span>
        <div className="mt-4 flex flex-wrap gap-2">
          {STACK.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <div className="quinn-surface flex flex-col items-start gap-4 rounded-lg border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-medium tracking-tight text-foreground">
            Ready to see where judgement actually moves the outcome?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the control tower and run a live analysis on a real matter.
          </p>
        </div>
        <Button size="lg" render={<Link href="/matters" />}>
          Enter Quinn
        </Button>
      </div>
    </main>
  );
}
