"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { StatusDot } from "@/components/quinn/status-dot";
import { STATUS_META } from "@/components/quinn/lane-config";
import { formatPercent, formatDateTime } from "@/lib/format";
import type { ClauseWithFinding } from "@/lib/graph/queries";

interface TraceResponse {
  finding: { id: string; status: string; confidence: number; riskScore: number; consequenceScore: number; triageScore: number; summary: string } | null;
  clause: Record<string, unknown> | null;
  provisions: { id: string; celex: string; article: string; title: string; text: string; source: string }[];
  deviations: { rule: { code: string; title: string; requirement: string }; explanation: string }[];
  episodes: { id: string; kind: string; label: string; createdAt: number }[];
  reviews: { id: string; decision: string; note: string; reviewer: string; at: number }[];
  signOffs: { id: string; attestation: string; signer: string; at: number }[];
}

function ScoreMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="font-mono text-xs font-medium tabular-nums">{formatPercent(value)}</span>
      </div>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function ClauseDetailPanel({
  clause,
  onDecided,
  readOnly = false,
}: {
  clause: ClauseWithFinding | null;
  onDecided: (clauseId: string, decision: string) => void;
  readOnly?: boolean;
}) {
  const [loaded, setLoaded] = useState<{ findingId: string; trace: TraceResponse } | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const trace = loaded && loaded.findingId === clause?.findingId ? loaded.trace : null;

  useEffect(() => {
    if (!clause?.findingId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting a fetch keyed off this same dependency change, not an avoidable derived value
    setLoading(true);
    setNote("");
    const findingId = clause.findingId;
    fetch(`/api/findings/${findingId}/trace`)
      .then((res) => res.json())
      .then((data) => setLoaded({ findingId, trace: data }))
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [clause?.findingId]);

  async function decide(decision: "approve" | "amend" | "reject" | "escalate") {
    if (!clause?.findingId) return;
    if (decision === "amend" && !note.trim()) {
      toast.error("Add the amended summary text before submitting an amend.");
      return;
    }
    setSubmitting(decision);
    try {
      const res = await fetch(`/api/findings/${clause.findingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      if (!res.ok) throw new Error(`Review failed: ${res.status}`);
      toast.success(`Clause ${clause.ref} ${decision}d.`);
      onDecided(clause.clauseId, decision);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  }

  if (!clause) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="rounded-full border border-dashed p-3">
          <FileText className="size-5 text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground">
          Select a clause to inspect its reasoning and sources.
        </p>
      </div>
    );
  }

  const statusMeta = clause.status ? STATUS_META[clause.status] : null;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {clause.ref}
          </span>
          {statusMeta && (
            <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium">
              <StatusDot tone={statusMeta.dot} />
              {statusMeta.label}
            </span>
          )}
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          {clause.heading}
        </h2>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* Clause text */}
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Clause text
          </h3>
          <p className="rounded-md bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
            {clause.text}
          </p>
        </section>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading reasoning and sources...
          </div>
        )}

        {trace?.finding && (
          <>
            {/* Score meters */}
            <section className="grid grid-cols-3 gap-5">
              <ScoreMeter label="Confidence" value={trace.finding.confidence} />
              <ScoreMeter label="Risk" value={trace.finding.riskScore} />
              <ScoreMeter label="Consequence" value={trace.finding.consequenceScore} />
            </section>

            {/* Model reasoning */}
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Model reasoning
              </h3>
              <p className="text-sm leading-relaxed text-foreground">{trace.finding.summary}</p>
            </section>

            {/* GDPR provisions */}
            {trace.provisions.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Relied on — live GDPR text
                </h3>
                <div className="space-y-2">
                  {trace.provisions.map((p) => (
                    <div key={p.id} className="rounded-md border p-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium text-foreground">
                          Art. {p.article} — {p.title}
                        </span>
                        <a
                          href={p.source}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[10px] text-muted-foreground underline decoration-dotted"
                        >
                          source
                        </a>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Playbook deviations */}
            {trace.deviations.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Deviates from firm playbook
                </h3>
                <div className="space-y-2">
                  {trace.deviations.map((d, i) => (
                    <div key={i} className="rounded-md border-l-2 border-l-foreground bg-muted/30 p-4">
                      <div className="font-mono text-xs font-medium text-foreground">
                        [{d.rule.code}] {d.rule.title}
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{d.explanation}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Provenance */}
            {trace.episodes.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Provenance
                </h3>
                <div className="space-y-1">
                  {trace.episodes.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm">
                      <span className="size-1 shrink-0 rounded-full bg-foreground/30" />
                      <span className="text-muted-foreground">{e.label}</span>
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {formatDateTime(e.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Audit trail */}
            {(trace.reviews.length > 0 || trace.signOffs.length > 0) && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Audit trail
                </h3>
                <div className="space-y-1">
                  {trace.reviews.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="size-1 shrink-0 rounded-full bg-foreground/50" />
                      <span className="text-foreground">
                        {r.reviewer} <span className="text-muted-foreground">{r.decision}d</span>
                      </span>
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {formatDateTime(r.at)}
                      </span>
                    </div>
                  ))}
                  {trace.signOffs.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="size-1 shrink-0 rounded-full bg-foreground/50" />
                      <span className="text-foreground">
                        Signed off by {s.signer}
                      </span>
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {formatDateTime(s.at)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!readOnly && (
          <>
            <Separator />
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Amend summary (optional)
              </h3>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Edit the assessment summary, or add a note for reject/escalate..."
                rows={3}
              />
            </section>
          </>
        )}
        {readOnly && (
          <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            Viewing a historical belief — actions disabled. Return to live to act.
          </p>
        )}
      </div>

      {/* ── Decision buttons ── */}
      {!readOnly && (
        <div className="grid grid-cols-2 gap-2 border-t p-4 sm:grid-cols-4">
          <Button onClick={() => decide("approve")} disabled={!!submitting} variant="default">
            {submitting === "approve" ? <Loader2 className="size-4 animate-spin" /> : "Approve"}
          </Button>
          <Button onClick={() => decide("amend")} disabled={!!submitting} variant="secondary">
            {submitting === "amend" ? <Loader2 className="size-4 animate-spin" /> : "Amend"}
          </Button>
          <Button onClick={() => decide("reject")} disabled={!!submitting} variant="destructive">
            {submitting === "reject" ? <Loader2 className="size-4 animate-spin" /> : "Reject"}
          </Button>
          <Button onClick={() => decide("escalate")} disabled={!!submitting} variant="outline">
            {submitting === "escalate" ? <Loader2 className="size-4 animate-spin" /> : "Escalate"}
          </Button>
        </div>
      )}
    </div>
  );
}
