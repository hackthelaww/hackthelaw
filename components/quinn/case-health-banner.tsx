"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  FileText, TrendingUp, AlertTriangle, Sparkles, X, Minus,
  CheckCircle2, Users, Calendar, Loader2, HelpCircle,
} from "lucide-react";
import { getCaseEvents, type CaseEvent, type CaseHealth } from "@/lib/backend";

// ---------------------------------------------------------------------------
// Executive Briefing Modal
// ---------------------------------------------------------------------------

function ExecutiveBriefing({
  events,
  health,
  onClose,
}: {
  events: CaseEvent[];
  health: CaseHealth;
  onClose: () => void;
}) {
  const anomalies = events.filter((e) => e.category === "anomaly");
  const positives = events.filter((e) => e.category === "positive");
  const unresolvedAnomalies = anomalies.filter((e) => !e.resolution);

  const keyEntities = new Set<string>();
  events.forEach((e) => e.entities_involved.forEach((ent) => keyEntities.add(ent)));

  const total = health.positive + health.anomalies + health.routine;
  const strengthPct = total > 0
    ? Math.round(((health.positive + anomalies.filter((e) => !!e.resolution).length) / total) * 100)
    : 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg animate-in fade-in zoom-in-95 duration-300">
        <div className="overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-foreground/10">
          <div className="relative bg-foreground px-8 pb-8 pt-6 text-background">
            <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1 text-background/60 hover:text-background transition-colors">
              <X className="size-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-background/15 backdrop-blur">
                <Sparkles className="size-5 text-background" />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">Executive Briefing</div>
                <div className="text-xs text-background/60">Quinn Case Intelligence</div>
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-4xl font-light tabular-nums tracking-tight">{strengthPct}%</div>
                <div className="text-[11px] uppercase tracking-widest text-background/50">Case Strength</div>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-2xl font-light tabular-nums">{health.positive}</div>
                  <div className="text-[10px] uppercase tracking-widest text-background/50">Supporting</div>
                </div>
                <div>
                  <div className="text-2xl font-light tabular-nums text-red-300">{health.unresolved_anomalies}</div>
                  <div className="text-[10px] uppercase tracking-widest text-background/50">Risks</div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-8 py-6 space-y-5 max-h-[50vh] overflow-y-auto">
            {positives.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Key Strengths</span>
                </div>
                <ul className="space-y-1.5">
                  {positives.slice(0, 5).map((e) => (
                    <li key={e.id} className="text-sm text-foreground/80 leading-snug">{e.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {unresolvedAnomalies.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="size-4 text-red-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Active Risks</span>
                </div>
                <ul className="space-y-1.5">
                  {unresolvedAnomalies.map((e) => (
                    <li key={e.id} className="text-sm text-red-600 dark:text-red-400 leading-snug">{e.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {keyEntities.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Key Parties</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(keyEntities).slice(0, 10).map((ent) => (
                    <span key={ent} className="rounded-full border px-2.5 py-1 text-xs text-foreground/70">{ent}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Activity</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{health.total} total events</span>
                <span>{anomalies.filter((e) => !!e.resolution).length} resolved</span>
              </div>
            </div>
          </div>
          <div className="border-t px-8 py-4 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Generated by Quinn AI</span>
            <button onClick={onClose} className="rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity">Close</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Main Banner Component
// ---------------------------------------------------------------------------

export function CaseHealthBanner({ matterId }: { matterId: string }) {
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [health, setHealth] = useState<CaseHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBriefing, setShowBriefing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    getCaseEvents(matterId)
      .then((data) => {
        setEvents(data.events);
        setHealth(data.health);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [matterId]);

  if (loading || !health || health.total === 0) return null;

  // Compute health bar values — no "routine", just healthy vs unresolved
  const resolvedAnomalies = events.filter((e) => e.category === "anomaly" && e.resolution).length;
  const healthy = health.positive + health.routine + resolvedAnomalies;
  const unhealthy = health.unresolved_anomalies;
  const barTotal = healthy + unhealthy;
  const healthyPct = barTotal > 0 ? Math.max((healthy / barTotal) * 100, healthy > 0 ? 3 : 0) : 100;
  const unhealthyPct = barTotal > 0 ? Math.max((unhealthy / barTotal) * 100, unhealthy > 0 ? 3 : 0) : 0;

  // Key entities
  const keyEntities = new Set<string>();
  events.forEach((e) => e.entities_involved.forEach((ent) => keyEntities.add(ent)));
  const keySources = new Set<string>();
  events.forEach((e) => e.source_documents.forEach((doc) => keySources.add(doc)));

  return (
    <div className="space-y-3 border-b pb-5 mb-1">
      {/* Tags + Briefing button */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-foreground/70">
            <FileText className="size-3" />
            {keySources.size} documents
          </span>
          {health.unresolved_anomalies > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-600">
              <AlertTriangle className="size-3" />
              {health.unresolved_anomalies} unresolved
            </span>
          )}
          {Array.from(keyEntities).slice(0, 6).map((ent) => (
            <span key={ent} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
              {ent}
            </span>
          ))}

          {/* Help button */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <HelpCircle className="size-3" />
          </button>
        </div>

        <button
          onClick={() => setShowBriefing(true)}
          className="group shrink-0 flex items-center gap-2 rounded-full border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-all hover:bg-foreground hover:text-background"
        >
          <Sparkles className="size-3.5 transition-transform group-hover:rotate-12" />
          Briefing
        </button>
      </div>

      {/* Help dropdown */}
      {showHelp && (
        <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2 animate-fade-in">
          <p className="font-medium text-foreground text-sm">How Quinn analyses your case</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span className="font-semibold text-foreground">Positive</span>
              </div>
              <p>New evidence that strengthens your case — witness confirmations, supporting documents, timeline consistency.</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Minus className="size-3.5 text-muted-foreground" />
                <span className="font-semibold text-foreground">Routine</span>
              </div>
              <p>Administrative changes with no legal impact — internal emails, formatting updates, duplicate information.</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="size-3.5 text-red-500" />
                <span className="font-semibold text-foreground">Anomaly</span>
              </div>
              <p>Contradictions between documents — conflicting dates, inconsistent statements, timeline impossibilities. Needs your review.</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/60">The health bar shows green when all issues are resolved. Red appears only for unresolved anomalies.</p>
        </div>
      )}

      {/* Health bar — just green and red */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Case Health</span>
          {unhealthy > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <span className="size-2 rounded-full bg-red-500" />
              {unhealthy} unresolved
            </span>
          )}
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-emerald-500">
          {unhealthy > 0 && (
            <>
              <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${healthyPct}%` }} />
              <div className="bg-red-500 transition-all duration-500" style={{ width: `${unhealthyPct}%` }} />
            </>
          )}
        </div>
      </div>

      {/* Briefing modal */}
      {showBriefing && (
        <ExecutiveBriefing events={events} health={health} onClose={() => setShowBriefing(false)} />
      )}
    </div>
  );
}
