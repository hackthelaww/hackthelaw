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
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{formatPercent(value)}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-muted">
        <div className="h-1 rounded-full bg-foreground/70" style={{ width: `${Math.round(value * 100)}%` }} />
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
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <FileText className="size-5 text-muted-foreground/60" />
        Select a clause to inspect its reasoning and sources.
      </div>
    );
  }

  const statusMeta = clause.status ? STATUS_META[clause.status] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-muted-foreground">
          <span>Clause {clause.ref}</span>
          {statusMeta && (
            <span className="flex items-center gap-1.5">
              <StatusDot tone={statusMeta.dot} />
              {statusMeta.label}
            </span>
          )}
        </div>
        <h2 className="mt-0.5 font-heading text-lg text-foreground">{clause.heading}</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section>
          <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Clause text</h3>
          <p className="rounded-md bg-muted/60 p-3 text-sm leading-relaxed">{clause.text}</p>
        </section>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading reasoning and sources...
          </div>
        )}

        {trace?.finding && (
          <>
            <section className="grid grid-cols-3 gap-4">
              <ScoreMeter label="Confidence" value={trace.finding.confidence} />
              <ScoreMeter label="Risk" value={trace.finding.riskScore} />
              <ScoreMeter label="Consequence" value={trace.finding.consequenceScore} />
            </section>

            <section>
              <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Why flagged — model reasoning</h3>
              <p className="text-sm leading-relaxed">{trace.finding.summary}</p>
            </section>

            {trace.provisions.length > 0 && (
              <section>
                <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Relied on (live GDPR text)</h3>
                <div className="space-y-2">
                  {trace.provisions.map((p) => (
                    <div key={p.id} className="rounded-md border p-3 text-sm">
                      <div className="font-medium">
                        Article {p.article} — {p.title}
                      </div>
                      <p className="mt-1 text-muted-foreground">{p.text}</p>
                      <a href={p.source} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline">
                        Source
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {trace.deviations.length > 0 && (
              <section>
                <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Deviates from firm playbook</h3>
                <div className="space-y-2">
                  {trace.deviations.map((d, i) => (
                    <div key={i} className="rounded-md border-l-2 border-foreground bg-muted/40 p-3 text-sm">
                      <div className="font-medium">
                        [{d.rule.code}] {d.rule.title}
                      </div>
                      <p className="mt-1 text-muted-foreground">{d.explanation}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {trace.episodes.length > 0 && (
              <section>
                <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Provenance</h3>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  {trace.episodes.map((e) => (
                    <li key={e.id}>
                      {e.label} — {formatDateTime(e.createdAt)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(trace.reviews.length > 0 || trace.signOffs.length > 0) && (
              <section>
                <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Audit trail</h3>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  {trace.reviews.map((r) => (
                    <li key={r.id}>
                      {r.reviewer} {r.decision}d — {formatDateTime(r.at)}
                      {r.note ? `: "${r.note}"` : ""}
                    </li>
                  ))}
                  {trace.signOffs.map((s) => (
                    <li key={s.id}>
                      Signed off by {s.signer} — {formatDateTime(s.at)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {!readOnly && (
          <>
            <Separator />
            <section>
              <h3 className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Amend summary (optional)</h3>
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
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            Viewing a historical belief — decide actions are disabled. Return to live to act on this clause.
          </p>
        )}
      </div>

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
