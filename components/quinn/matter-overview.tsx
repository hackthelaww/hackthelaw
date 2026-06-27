"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Loader2, CheckCircle2, AlertTriangle, Minus, Clock,
  Shield, FileWarning, ChevronDown, ChevronRight,
  FileText, Search, Ban, PenLine,
} from "lucide-react";
import { getCaseEvents, resolveEvent, type CaseEvent, type CaseHealth } from "@/lib/backend";
import { DocumentViewer } from "@/components/quinn/document-viewer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function groupByDate(events: CaseEvent[]): [string, CaseEvent[]][] {
  const groups: Record<string, CaseEvent[]> = {};
  for (const e of events) {
    const dateKey = e.created_at.slice(0, 10);
    (groups[dateKey] ??= []).push(e);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

// ---------------------------------------------------------------------------
// Case Summary Tags (above the health bar)
// ---------------------------------------------------------------------------

function CaseSummaryTags({ events, health }: { events: CaseEvent[]; health: CaseHealth }) {
  // Extract key info from events
  const keyEntities = new Set<string>();
  const keySources = new Set<string>();
  events.forEach((e) => {
    e.entities_involved.forEach((ent) => keyEntities.add(ent));
    e.source_documents.forEach((doc) => keySources.add(doc));
  });

  const topEntities = Array.from(keyEntities).slice(0, 6);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Document count */}
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-foreground/70">
        <FileText className="size-3" />
        {keySources.size} docs
      </span>

      {/* Event count */}
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
        <TrendingUp className="size-3" />
        {health.positive} findings
      </span>

      {/* Anomalies */}
      {health.unresolved_anomalies > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-600">
          <AlertTriangle className="size-3" />
          {health.unresolved_anomalies} unresolved
        </span>
      )}

      {/* Key entities as pills */}
      {topEntities.map((ent) => (
        <span key={ent} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
          {ent}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Executive Briefing Modal (Quinn stick man)
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
  // Derive the briefing from events
  const anomalies = events.filter((e) => e.category === "anomaly");
  const positives = events.filter((e) => e.category === "positive");
  const unresolvedAnomalies = anomalies.filter((e) => !e.resolution);

  const keyEntities = new Set<string>();
  events.forEach((e) => e.entities_involved.forEach((ent) => keyEntities.add(ent)));

  const strengthPct = health.total > 0
    ? Math.round((health.positive / health.total) * 100)
    : 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg animate-in fade-in zoom-in-95 duration-300">
        {/* Card */}
        <div className="overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-foreground/10">
          {/* Header — gradient band */}
          <div className="relative bg-foreground px-8 pb-8 pt-6 text-background">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-1 text-background/60 hover:text-background transition-colors"
            >
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

            {/* Strength meter */}
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

          {/* Body */}
          <div className="px-8 py-6 space-y-5 max-h-[50vh] overflow-y-auto">
            {/* Key Strengths */}
            {positives.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Key Strengths</span>
                </div>
                <ul className="space-y-1.5">
                  {positives.slice(0, 5).map((e) => (
                    <li key={e.id} className="text-sm text-foreground/80 leading-snug">
                      {e.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Active Risks */}
            {unresolvedAnomalies.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="size-4 text-red-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Active Risks</span>
                </div>
                <ul className="space-y-1.5">
                  {unresolvedAnomalies.map((e) => (
                    <li key={e.id} className="text-sm text-red-600 dark:text-red-400 leading-snug">
                      {e.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Parties */}
            {keyEntities.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Key Parties</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(keyEntities).slice(0, 10).map((ent) => (
                    <span key={ent} className="rounded-full border px-2.5 py-1 text-xs text-foreground/70">
                      {ent}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline snapshot */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Activity</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{health.total} total events</span>
                <span>{events.filter((e) => e.category === "anomaly" && e.resolution).length} resolved</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t px-8 py-4 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Generated by Quinn AI
            </span>
            <button
              onClick={onClose}
              className="rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Health Bar
// ---------------------------------------------------------------------------

function HealthBar({ health, events }: { health: CaseHealth; events: CaseEvent[] }) {
  const total = health.positive + health.routine + health.anomalies;
  if (total === 0) return null;

  // Resolved anomalies count as healthy
  const resolvedAnomalies = events.filter((e) => e.category === "anomaly" && e.resolution).length;
  const healthy = health.positive + resolvedAnomalies;
  const routine = health.routine;
  const unhealthy = health.unresolved_anomalies;
  const barTotal = healthy + routine + unhealthy;

  const pct = (n: number) => Math.max((n / barTotal) * 100, n > 0 ? 3 : 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">Case Health</span>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            {healthy} healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-foreground/20" />
            {routine} routine
          </span>
          {unhealthy > 0 && (
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-red-500" />
              {unhealthy} unresolved
            </span>
          )}
        </div>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${pct(healthy)}%` }} />
        <div className="bg-foreground/15 transition-all duration-500" style={{ width: `${pct(routine)}%` }} />
        {unhealthy > 0 && (
          <div className="bg-red-500 transition-all duration-500" style={{ width: `${pct(unhealthy)}%` }} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolution Config
// ---------------------------------------------------------------------------

const RESOLUTION_CONFIG = {
  expected: {
    label: "Expected",
    description: "This inconsistency is expected and doesn't require action.",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "hover:bg-emerald-500/10 hover:border-emerald-500/30",
  },
  typo: {
    label: "Typo",
    description: "This is a typographical error in one of the documents.",
    icon: PenLine,
    color: "text-amber-600",
    bg: "hover:bg-amber-500/10 hover:border-amber-500/30",
  },
  needs_investigation: {
    label: "Investigate",
    description: "This needs further investigation — could indicate a material inconsistency.",
    icon: Search,
    color: "text-red-600",
    bg: "hover:bg-red-500/10 hover:border-red-500/30",
  },
  dismissed: {
    label: "Dismiss",
    description: "Not relevant to the case.",
    icon: Ban,
    color: "text-muted-foreground",
    bg: "hover:bg-muted",
  },
} as const;

// ---------------------------------------------------------------------------
// Anomaly Alert
// ---------------------------------------------------------------------------

function AnomalyAlert({
  event,
  matterId,
  onResolved,
}: {
  event: CaseEvent;
  matterId: string;
  onResolved: () => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);

  async function handleResolve(resolution: string) {
    setResolving(true);
    try {
      await resolveEvent(matterId, event.id, resolution);
      onResolved();
    } catch { /* ignore */ }
    setResolving(false);
    setShowActions(false);
  }

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${
      event.resolution
        ? "border-border bg-background"
        : "border-red-500/20 bg-red-500/5"
    }`}>
      <div className="flex items-start gap-3">
        <FileWarning className={`mt-0.5 size-5 shrink-0 ${event.resolution ? "text-muted-foreground" : "text-red-500"}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{event.title}</span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              event.severity === "high" ? "bg-red-500/20 text-red-600" :
              event.severity === "medium" ? "bg-amber-500/20 text-amber-600" :
              "bg-foreground/10 text-muted-foreground"
            }`}>
              {event.severity}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground/70">{event.description}</p>

          {event.source_documents.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {event.source_documents.map((doc, i) => (
                <button
                  key={i}
                  onClick={() => setViewingDoc(doc)}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <FileText className="size-3" />
                  {doc}
                </button>
              ))}
            </div>
          )}

          {event.entities_involved.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {event.entities_involved.map((entity, i) => (
                <span key={i} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {entity}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {!event.resolution && !showActions && (
        <div className="pl-8">
          <button
            onClick={() => setShowActions(true)}
            className="text-[12px] font-medium text-foreground/60 hover:text-foreground underline underline-offset-4"
          >
            Take action
          </button>
        </div>
      )}

      {!event.resolution && showActions && (
        <div className="pl-8 space-y-2">
          <p className="text-[11px] text-muted-foreground mb-2">How should this be handled?</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(RESOLUTION_CONFIG) as [string, typeof RESOLUTION_CONFIG[keyof typeof RESOLUTION_CONFIG]][]).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={key}
                  onClick={() => handleResolve(key)}
                  disabled={resolving}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all disabled:opacity-50 ${config.bg}`}
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${config.color}`} />
                  <div>
                    <div className={`text-[12px] font-semibold ${config.color}`}>{config.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{config.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={() => setShowActions(false)} className="text-[11px] text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      )}

      {event.resolution && (
        <div className="pl-8 flex items-center gap-2 text-[11px] text-muted-foreground">
          {(() => {
            const config = RESOLUTION_CONFIG[event.resolution as keyof typeof RESOLUTION_CONFIG];
            if (!config) return <span>Resolved as {event.resolution}</span>;
            const Icon = config.icon;
            return (
              <>
                <Icon className={`size-3.5 ${config.color}`} />
                <span>Resolved as <span className={`font-medium ${config.color}`}>{config.label.toLowerCase()}</span></span>
              </>
            );
          })()}
        </div>
      )}

      {viewingDoc && (
        <DocumentViewer documentId={viewingDoc} filename={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Card
// ---------------------------------------------------------------------------

function EventCard({ event }: { event: CaseEvent }) {
  if (event.category === "positive") {
    return (
      <div className="flex items-start gap-3 rounded-md border p-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{event.title}</div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{event.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed p-3 opacity-60">
      <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-muted-foreground">{event.title}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date Group
// ---------------------------------------------------------------------------

function DateGroup({ date, events, matterId, onRefresh }: {
  date: string;
  events: CaseEvent[];
  matterId: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const anomalies = events.filter((e) => e.category === "anomaly");
  const others = events.filter((e) => e.category !== "anomaly");

  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <div className="relative z-10 flex size-7 items-center justify-center rounded-full border bg-background">
          <Clock className="size-3.5 text-muted-foreground" />
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>

      <div className="flex-1 pb-6">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-left">
          {expanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          <span className="text-sm font-semibold">{formatRelativeDate(date)}</span>
          <span className="text-xs text-muted-foreground">{events.length} event{events.length !== 1 ? "s" : ""}</span>
          {anomalies.length > 0 && (
            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
              {anomalies.length}
            </span>
          )}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2 animate-stagger">
            {anomalies.map((e) => (
              <AnomalyAlert key={e.id} event={e} matterId={matterId} onResolved={onRefresh} />
            ))}
            {others.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MatterOverview({ matterId }: { matterId: string }) {
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [health, setHealth] = useState<CaseHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  function fetchEvents() {
    setLoading(true);
    getCaseEvents(matterId)
      .then((data) => {
        setEvents(data.events);
        setHealth(data.health);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchEvents(); }, [matterId]);

  const grouped = useMemo(() => groupByDate(events), [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Shield className="size-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">No case events yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload documents to start building the case intelligence timeline.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const unresolvedAnomalies = events.filter((e) => e.category === "anomaly" && !e.resolution);

  return (
    <div className="mx-auto max-w-2xl py-4 space-y-4">
      {/* Section intro */}
      <div className="rounded-lg border bg-muted/20 px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Case Intelligence Overview</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Quinn continuously analyses every document uploaded to this case. Each time new evidence arrives,
          it cross-references facts, dates, and statements against everything already known — surfacing
          what strengthens your position, flagging contradictions that need your judgement, and tracking
          the case as it evolves over time. Events are ordered by the date the evidence was filed.
        </p>
      </div>

      {/* Anomaly banner */}
      {unresolvedAnomalies.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/8 px-4 py-2.5 text-sm">
          <AlertTriangle className="size-4 text-red-500" />
          <span className="font-medium text-red-600 dark:text-red-400">
            {unresolvedAnomalies.length} anomal{unresolvedAnomalies.length === 1 ? "y" : "ies"} need your attention
          </span>
        </div>
      )}

      {/* Event timeline */}
      <div>
        {grouped.map(([date, dateEvents]) => (
          <DateGroup
            key={date}
            date={date}
            events={dateEvents}
            matterId={matterId}
            onRefresh={fetchEvents}
          />
        ))}

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <div className="size-3 rounded-full bg-foreground/20" />
          </div>
          <span className="text-xs text-muted-foreground">Case started</span>
        </div>
      </div>

    </div>
  );
}
