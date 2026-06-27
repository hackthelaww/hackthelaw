"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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

export function InspectSheet({
  clause,
  open,
  onOpenChange,
  onDecided,
}: {
  clause: ClauseWithFinding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecided: (clauseId: string, decision: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ findingId: string; trace: TraceResponse } | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const trace = loaded && loaded.findingId === clause?.findingId ? loaded.trace : null;

  useEffect(() => {
    if (!open || !clause?.findingId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting a fetch keyed off this same dependency change, not an avoidable derived value
    setLoading(true);
    setNote("");
    const findingId = clause.findingId;
    fetch(`/api/findings/${findingId}/trace`)
      .then((res) => res.json())
      .then((data) => setLoaded({ findingId, trace: data }))
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [open, clause?.findingId]);

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
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(null);
    }
  }

  const statusMeta = clause?.status ? STATUS_META[clause.status] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>
            Clause {clause?.ref} — {clause?.heading}
          </SheetTitle>
          <SheetDescription>Why this was flagged, what it relies on, and what to do about it.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {clause?.status && statusMeta && (
            <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
          )}

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Clause text</h3>
            <p className="rounded-md bg-muted p-3 text-sm">{clause?.text}</p>
          </section>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading reasoning and sources...
            </div>
          )}

          {trace?.finding && (
            <>
              <section className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Confidence</div>
                  <div className="font-medium">{formatPercent(trace.finding.confidence)}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Risk</div>
                  <div className="font-medium">{formatPercent(trace.finding.riskScore)}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-muted-foreground">Consequence</div>
                  <div className="font-medium">{formatPercent(trace.finding.consequenceScore)}</div>
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Why flagged — model reasoning</h3>
                <p className="text-sm">{trace.finding.summary}</p>
              </section>

              {trace.provisions.length > 0 && (
                <section>
                  <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Relied on (live GDPR text)</h3>
                  <div className="space-y-2">
                    {trace.provisions.map((p) => (
                      <div key={p.id} className="rounded-md border p-2 text-sm">
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
                  <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Deviates from firm playbook</h3>
                  <div className="space-y-2">
                    {trace.deviations.map((d, i) => (
                      <div key={i} className="rounded-md border border-amber-400 bg-amber-50/60 p-2 text-sm dark:bg-amber-950/20">
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
                  <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Provenance</h3>
                  <ul className="text-sm text-muted-foreground">
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
                  <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Audit trail</h3>
                  <ul className="text-sm text-muted-foreground">
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

          <Separator />

          <section>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Amend summary (optional)</h3>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Edit the assessment summary, or add a note for reject/escalate..."
              rows={3}
            />
          </section>
        </div>

        <SheetFooter className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
