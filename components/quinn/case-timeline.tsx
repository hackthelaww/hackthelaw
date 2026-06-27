"use client";

import { useState, useEffect } from "react";
import {
  FileText, CheckCircle2, AlertTriangle, Copy, Clock,
  ChevronDown, ChevronRight, ArrowUpRight, Loader2,
} from "lucide-react";
import { getTimeline, type TimelineBatch, type TimelineData } from "@/lib/backend";
import { DocumentDiffDialog } from "@/components/quinn/document-diff-dialog";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status, score, parentFilename }: {
  status: string;
  score: number | null;
  parentFilename: string | null;
}) {
  if (status === "exact_duplicate") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
        <Copy className="size-3" />
        Duplicate
      </span>
    );
  }
  if (status === "near_duplicate") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
        <AlertTriangle className="size-3" />
        ~{Math.round((score ?? 0) * 100)}% match
      </span>
    );
  }
  if (status === "similar") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600">
        <AlertTriangle className="size-3" />
        Changed significantly
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
      <CheckCircle2 className="size-3" />
      New
    </span>
  );
}

function EntityBar({ count, max }: { count: number; max: number }) {
  const width = max > 0 ? Math.max((count / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/30 transition-all duration-700"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function DocumentCard({ doc, onViewDiff }: {
  doc: TimelineBatch["documents"][0];
  onViewDiff: (docId: string) => void;
}) {
  const isDupe = doc.similarity_status === "exact_duplicate";

  return (
    <div className={`group flex items-start gap-3 rounded-md border p-3 transition-all hover:border-foreground/20 ${isDupe ? "opacity-50" : ""}`}>
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{doc.filename}</span>
          <StatusBadge
            status={doc.similarity_status}
            score={doc.similarity_score}
            parentFilename={doc.similarity_parent_filename}
          />
        </div>

        {doc.version_number > 1 && (
          <div className="mt-0.5 text-[11px] text-amber-600">
            v{doc.version_number} of {doc.similarity_parent_filename}
          </div>
        )}

        {isDupe && doc.similarity_parent_filename && (
          <div className="mt-0.5 text-[11px] text-red-500">
            Same as {doc.similarity_parent_filename} — skipped
          </div>
        )}

        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          {!isDupe && doc.entity_count > 0 && (
            <span>{doc.entity_count} entities extracted</span>
          )}
          {doc.char_count > 0 && (
            <span>{doc.char_count.toLocaleString()} chars</span>
          )}
          {doc.similarity_status === "near_duplicate" && (
            <button
              onClick={() => onViewDiff(doc.id)}
              className="inline-flex items-center gap-0.5 text-amber-600 hover:underline"
            >
              View diff
              <ArrowUpRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BatchNode({ batch, maxEntities, onViewDiff }: {
  batch: TimelineBatch;
  maxEntities: number;
  onViewDiff: (docId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="relative flex gap-4">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        {/* Dot */}
        <div className="relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-foreground/20 bg-background text-xs font-bold text-foreground">
          {batch.batch_index}
        </div>
        {/* Vertical line */}
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">
            {formatDate(batch.batch_date)}
          </span>
          <span className="text-xs text-muted-foreground">
            {batch.new_doc_count} document{batch.new_doc_count !== 1 ? "s" : ""}
          </span>
        </button>

        {/* Entity growth bar */}
        <div className="mt-2 max-w-xs">
          <EntityBar count={batch.cumulative_entity_count} max={maxEntities} />
        </div>

        {/* Documents */}
        {expanded && (
          <div className="mt-3 space-y-2 animate-stagger">
            {batch.documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} onViewDiff={onViewDiff} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CaseTimeline({ matterId }: { matterId: string }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffDocId, setDiffDocId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getTimeline(matterId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [matterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
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

  if (!data || data.batches.length === 0) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        No documents uploaded yet. Upload documents to see the case timeline.
      </div>
    );
  }

  const maxEntities = Math.max(...data.batches.map((b) => b.cumulative_entity_count), 1);

  return (
    <div className="mx-auto max-w-2xl py-6">
      {/* Summary stats */}
      <div className="mb-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
        <div className="bg-background px-5 py-4">
          <div className="text-2xl font-light tabular-nums">{data.total_documents}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Documents
          </div>
        </div>
        <div className="bg-background px-5 py-4">
          <div className="text-2xl font-light tabular-nums">{data.total_entities}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Entities
          </div>
        </div>
        <div className="bg-background px-5 py-4">
          <div className="flex items-baseline gap-1">
            <div className="text-2xl font-light tabular-nums">{data.batches.length}</div>
            {data.total_duplicates_skipped > 0 && (
              <span className="text-xs text-red-500">
                ({data.total_duplicates_skipped} dupes)
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Upload sessions
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {data.batches.map((batch) => (
          <BatchNode
            key={batch.batch_date}
            batch={batch}
            maxEntities={maxEntities}
            onViewDiff={setDiffDocId}
          />
        ))}

        {/* End dot */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <div className="flex size-3 items-center justify-center rounded-full bg-foreground/20" />
          </div>
          <span className="text-xs text-muted-foreground">
            <Clock className="mr-1 inline size-3" />
            {data.date_range.first === data.date_range.last
              ? `Started ${formatDate(data.date_range.first!)}`
              : `${formatDate(data.date_range.first!)} — ${formatDate(data.date_range.last!)}`}
          </span>
        </div>
      </div>

      {/* Diff dialog */}
      {diffDocId && (
        <DocumentDiffDialog
          documentId={diffDocId}
          onClose={() => setDiffDocId(null)}
        />
      )}
    </div>
  );
}
