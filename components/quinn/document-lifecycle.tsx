"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, GitBranch } from "lucide-react";
import { DocumentViewer } from "@/components/quinn/document-viewer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionNode {
  id: string;
  version: string;
  date: string;
  uploaded_by_email: string;
  change_type: "initial" | "major" | "minor" | "current" | "draft";
  similarity_score: number | null;
  entity_count: number;
  key_changes: string[];
  semantic_explanation: string;
}

interface DocumentLifecycleData {
  document_name: string;
  document_type: string;
  total_versions: number;
  versions: VersionNode[];
  reviews: unknown[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CHANGE_CONFIG = {
  initial: {
    label: "INITIAL",
    ringColor: "ring-foreground/40",
    bgColor: "bg-foreground/10",
    textColor: "text-foreground",
    badgeBg: "bg-foreground/10",
    badgeText: "text-foreground/70",
  },
  minor: {
    label: "MINOR",
    ringColor: "ring-foreground/30",
    bgColor: "bg-foreground/5",
    textColor: "text-foreground/80",
    badgeBg: "bg-foreground/8",
    badgeText: "text-muted-foreground",
  },
  major: {
    label: "MAJOR",
    ringColor: "ring-amber-500/60",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-600 dark:text-amber-400",
  },
  current: {
    label: "CURRENT",
    ringColor: "ring-emerald-500/60",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-600 dark:text-emerald-400",
  },
  draft: {
    label: "DRAFT",
    ringColor: "ring-foreground/20",
    bgColor: "bg-transparent",
    textColor: "text-muted-foreground",
    badgeBg: "bg-foreground/5",
    badgeText: "text-muted-foreground",
  },
} as const;

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Version Node (clickable — opens document viewer)
// ---------------------------------------------------------------------------

function VersionDot({
  node,
  index,
  isLast,
  nextNode,
  onClick,
}: {
  node: VersionNode;
  index: number;
  isLast: boolean;
  nextNode: VersionNode | null;
  onClick: () => void;
}) {
  const config = CHANGE_CONFIG[node.change_type];
  const isDraft = node.change_type === "draft";
  const isCurrent = node.change_type === "current";
  const nextIsMajor = nextNode?.change_type === "major";

  return (
    <div
      className="lifecycle-node relative flex flex-col items-center"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Connector line to next node */}
      {!isLast && (
        <div
          className={`absolute left-[50%] top-[20px] h-[2px] z-0 ${
            nextIsMajor
              ? "border-t-2 border-dashed border-foreground/15"
              : "bg-foreground/15"
          }`}
          style={{ width: "100%" }}
        />
      )}

      {/* The dot — click to open document */}
      <button
        onClick={onClick}
        title="Click to view this version"
        className={`group relative z-10 flex size-10 items-center justify-center rounded-full ring-2 transition-all duration-300 hover:scale-110 hover:shadow-md ${config.ringColor} ${config.bgColor} ${isDraft ? "border-2 border-dashed border-foreground/20 ring-0" : ""} ${isCurrent ? "shadow-[0_0_16px_rgba(52,211,153,0.25)]" : ""}`}
      >
        <span className={`font-mono text-xs font-bold ${config.textColor}`}>
          {node.version}
        </span>
        {isCurrent && (
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
        )}
      </button>

      {/* Labels */}
      <div className="mt-2 flex flex-col items-center gap-0.5">
        <span className="font-mono text-[11px] font-medium text-foreground/80">
          v{node.version}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatShortDate(node.date)}
        </span>
        <span className="text-[9px] text-muted-foreground/60">
          {node.uploaded_by_email ? node.uploaded_by_email.split("@")[0] : ""}
        </span>
      </div>

      {/* Change badge */}
      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider ${config.badgeBg} ${config.badgeText}`}>
        {config.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DocumentLifecycle({
  documentId,
  matterId,
}: {
  documentId: string;
  matterId: string;
}) {
  const [data, setData] = useState<DocumentLifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<VersionNode | null>(null);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

  useEffect(() => {
    setLoading(true);
    fetch(`${BACKEND}/api/documents/${encodeURIComponent(documentId)}/lifecycle`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [documentId, BACKEND]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data || data.versions.length <= 1) {
    return null; // Don't show lifecycle for single-version docs
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitBranch className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{data.document_name}</span>
        <span className="text-[11px] text-muted-foreground">
          {data.total_versions} versions
        </span>
      </div>

      {/* Version pipeline */}
      <div className="overflow-x-auto overflow-y-visible pb-4 pt-2">
        <div
          className="inline-grid items-start gap-0 px-6"
          style={{
            gridTemplateColumns: `repeat(${data.versions.length}, minmax(100px, 1fr))`,
          }}
        >
          {data.versions.map((node, i) => (
            <VersionDot
              key={node.id}
              node={node}
              index={i}
              isLast={i === data.versions.length - 1}
              nextNode={data.versions[i + 1] ?? null}
              onClick={() => setViewingVersion(node)}
            />
          ))}
        </div>
      </div>

      {/* Document viewer for selected version */}
      {viewingVersion && (
        <DocumentViewer
          documentId={viewingVersion.id}
          filename={`${data.document_name} (v${viewingVersion.version})`}
          onClose={() => setViewingVersion(null)}
        />
      )}
    </div>
  );
}
