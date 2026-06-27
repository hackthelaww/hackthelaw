import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    title: "Dashboard",
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

const STATS = [
  { value: "100+", label: "GDPR provisions ingested live from EUR-Lex" },
  { value: "10", label: "Firm playbook rules checked against every clause" },
  { value: "3", label: "Triage lanes — needs judgement, quick confirm, auto-cleared" },
  { value: "0", label: "Fabricated facts — real error shown if a source is unreachable" },
];

const STACK = ["Next.js", "Neo4j", "Perplexity Agent API", "EUR-Lex"];

export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-10 py-16">
      {/* ── Hero ── */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] -mt-16 w-screen overflow-hidden border-b pb-20">
        <video
          className="absolute inset-0 -z-10 size-full object-cover"
          src="/London_Skyline_1.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="mx-auto max-w-5xl px-10 pt-28">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            For human–AI legal teams
          </span>
          <h1 className="mt-5 max-w-3xl text-6xl font-semibold tracking-tight text-foreground sm:text-7xl">
            Supervision, not automation.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Quinn triages AI review by confidence × risk × consequence, and keeps a
            permanent, bi-temporal record of every judgement call a partner makes.
          </p>
          <div className="mt-9 flex items-center gap-3">
            <Button size="lg" render={<Link href="/matters" />}>
              Enter the dashboard
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/health" />}>
              Check system health
            </Button>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-b py-16">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="bg-background px-6 py-8">
              <div className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
                {stat.value}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
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
            Open the dashboard and run a live analysis on a real matter.
          </p>
        </div>
        <Button size="lg" render={<Link href="/matters" />}>
          Enter Quinn
        </Button>
      </div>
    </main>
  );
}
