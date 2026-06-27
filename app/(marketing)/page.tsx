import Link from "next/link";
import { Button } from "@/components/ui/button";

const PILLARS = [
  {
    title: "Plan",
    body: "Decide what a matter actually needs — across one case or your whole desk — before any work starts.",
  },
  {
    title: "Coordinate",
    body: "Direct who carries each piece out, human or AI, and which tool does it.",
  },
  {
    title: "Review",
    body: "Work product comes back triaged by confidence × risk × consequence, so your attention goes to what actually needs it.",
  },
  {
    title: "Sign-off",
    body: "Approve, amend, reject, or escalate — every decision permanently recorded, never silently overwritten.",
  },
];

const STEPS = [
  {
    title: "Dashboard",
    body:
      "Matters listed as cards; any matter with work product needing your judgement shows an amber badge.",
  },
  {
    title: "Matter view",
    body:
      "Open a matter, run analysis, and watch AI-assessed work get triaged live into three lanes by confidence, risk, and consequence.",
  },
  {
    title: "Inspect",
    body:
      "Open any item to see the model's reasoning, the real source it relied on, any deviation from the firm's playbook, and the confidence/risk/consequence breakdown.",
  },
  {
    title: "Decide",
    body:
      "Approve, amend, reject, or escalate. Each writes a real Review (and a SignOff on approve) to the graph; the lane and badge update immediately.",
  },
  {
    title: "New information arrives",
    body:
      "Ingest a real update document for one item and watch it re-assess — flipping status if the new information actually contradicts the prior belief.",
  },
  {
    title: "Time-scrub",
    body:
      "Drag the scrubber on the matter page to see any item's status at each point in time, with the old belief's window closed, not deleted.",
  },
  {
    title: "Ask Quinn",
    body:
      "“What changed on this matter since my last visit?” — answered from real graph traversals, with citations back to the nodes used.",
  },
];

const STATS = [
  { value: "2", label: "Timestamps on every belief — when it became true, when Quinn learned it" },
  { value: "3", label: "Triage lanes — needs judgement, quick confirm, auto-cleared" },
  { value: "1", label: "Permanent record per matter — every review and sign-off, never overwritten" },
  { value: "0", label: "Fabricated facts — real error shown if a source is unreachable" },
];

const STACK = ["Next.js", "Neo4j", "Perplexity Agent API", "EUR-Lex"];

export default function LandingPage() {
  return (
    <main className="isolate w-full bg-[#FAF8F4]">
      <div className="mx-auto w-full max-w-6xl px-10 py-20">
        {/* ── Hero ── */}
        <section className="relative left-1/2 right-1/2 -mx-[50vw] -mt-20 w-screen overflow-hidden pb-28">
          <video
            className="absolute inset-0 -z-10 size-full object-cover"
            src="/London1.mp4"
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="mx-auto max-w-6xl px-10 pt-36">
            <h1 className="mt-6 max-w-3xl text-6xl font-medium tracking-tight text-white sm:text-[5.25rem] sm:leading-[1.02]">
              Supervision, without limits.
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-white/75">
              Plan the work, coordinate who — human or AI — carries it out, review
              what comes back, and sign off with a permanent record of every
              judgement call. One matter, or your whole portfolio.
            </p>
            <div className="mt-10 flex items-center gap-3">
              <Button
                size="lg"
                className="rounded-full bg-white px-6 text-black hover:bg-white/90"
                render={<Link href="/login" />}
              >
                Try Quinn now
              </Button>
            </div>
          </div>
        </section>

        {/* ── Pillars ── */}
        <section className="py-24">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Why Quinn?
          </span>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-foreground/70">
            Most legal AI tools speed up the junior work itself. Quinn is built for
            the person overseeing it — scaling from a two-person matter to a full
            portfolio without needing a dedicated project manager.
          </p>
          <div className="mt-14 grid gap-x-8 gap-y-12 border-t border-foreground/10 pt-10 sm:grid-cols-4">
            {PILLARS.map((pillar, i) => (
              <div key={pillar.title}>
                <span className="font-mono text-xs text-muted-foreground/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-3 text-xl font-medium tracking-tight text-foreground">{pillar.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="border-t border-foreground/10 py-24">
          <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="text-6xl font-light tabular-nums tracking-tight text-foreground">
                  {stat.value}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="border-t border-foreground/10 py-24">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Live today — review &amp; sign-off
          </span>
          <div className="animate-stagger mt-10 grid gap-y-8 sm:grid-cols-2 sm:gap-x-12">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex items-start gap-5">
                <span className="mt-0.5 font-mono text-xs text-muted-foreground/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-medium tracking-tight text-foreground">{step.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Stack ── */}
        <section className="border-t border-foreground/10 py-24">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Built on
          </span>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {STACK.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
      </div>

      {/* ── Closing CTA ── */}
      <section className="bg-foreground py-24">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="max-w-md text-3xl font-medium tracking-tight text-background">
              Ready to see where your judgement actually moves the outcome?
            </p>
            <p className="mt-3 text-sm text-background/60">
              Open the dashboard and see triage, review, and sign-off working on a real matter.
            </p>
          </div>
          <Button
            size="lg"
            variant="secondary"
            className="rounded-full px-6"
            render={<Link href="/login" />}
          >
            Try Quinn now
          </Button>
        </div>
      </section>
    </main>
  );
}
