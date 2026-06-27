"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, ChevronLeft, X, FileText, Minus, Plus, Equal } from "lucide-react";
import { getDocumentDiff } from "@/lib/backend";

interface DiffBlock {
  type: "equal" | "added" | "removed" | "changed";
  old_line: number | null;
  new_line: number | null;
  old_text: string;
  new_text: string;
}

interface DiffData {
  original_filename: string;
  new_filename: string;
  similarity_score: number;
  diff_blocks: DiffBlock[];
  original_chars: number;
  new_chars: number;
  stats: { additions: number; deletions: number; unchanged: number };
}

type ViewMode = "split" | "unified";

function SplitDiffView({ blocks }: { blocks: DiffBlock[] }) {
  return (
    <div className="divide-y divide-border/50">
      {blocks.map((block, i) => (
        <div key={i} className="flex">
          {/* Old side */}
          <div className={`flex-1 flex min-w-0 ${
            block.type === "removed" || block.type === "changed"
              ? "bg-red-500/6 dark:bg-red-500/10"
              : block.type === "added"
                ? "bg-muted/30"
                : ""
          }`}>
            <div className="w-10 shrink-0 select-none py-1 pr-2 text-right font-mono text-[11px] text-muted-foreground/50">
              {block.old_line ?? ""}
            </div>
            <div className={`flex-1 py-1 pr-4 font-mono text-[13px] leading-[1.6] ${
              block.type === "removed"
                ? "text-red-700 dark:text-red-400"
                : block.type === "changed"
                  ? "text-red-700 dark:text-red-400 line-through decoration-red-400/40"
                  : block.type === "added"
                    ? "text-muted-foreground/30"
                    : "text-foreground/80"
            }`}>
              {block.type === "added" ? "" : block.old_text}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-border shrink-0" />

          {/* New side */}
          <div className={`flex-1 flex min-w-0 ${
            block.type === "added" || block.type === "changed"
              ? "bg-emerald-500/6 dark:bg-emerald-500/10"
              : block.type === "removed"
                ? "bg-muted/30"
                : ""
          }`}>
            <div className="w-10 shrink-0 select-none py-1 pr-2 text-right font-mono text-[11px] text-muted-foreground/50">
              {block.new_line ?? ""}
            </div>
            <div className={`flex-1 py-1 pr-4 font-mono text-[13px] leading-[1.6] ${
              block.type === "added"
                ? "text-emerald-700 dark:text-emerald-400"
                : block.type === "changed"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : block.type === "removed"
                    ? "text-muted-foreground/30"
                    : "text-foreground/80"
            }`}>
              {block.type === "removed" ? "" : block.new_text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UnifiedDiffView({ blocks }: { blocks: DiffBlock[] }) {
  return (
    <div className="divide-y divide-border/30">
      {blocks.map((block, i) => {
        if (block.type === "equal") {
          return (
            <div key={i} className="flex py-0.5">
              <div className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-muted-foreground/40">{block.old_line}</div>
              <div className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-muted-foreground/40">{block.new_line}</div>
              <div className="w-5 shrink-0 text-center text-muted-foreground/30"> </div>
              <div className="flex-1 font-mono text-[13px] leading-[1.6] text-foreground/70">{block.old_text}</div>
            </div>
          );
        }
        if (block.type === "removed" || (block.type === "changed" && block.old_text)) {
          return (
            <div key={`${i}-old`} className="flex bg-red-500/6 dark:bg-red-500/10 py-0.5">
              <div className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-red-500/60">{block.old_line}</div>
              <div className="w-10 shrink-0" />
              <div className="w-5 shrink-0 text-center font-mono text-[11px] font-bold text-red-500">−</div>
              <div className="flex-1 font-mono text-[13px] leading-[1.6] text-red-700 dark:text-red-400">{block.old_text}</div>
            </div>
          );
        }
        if (block.type === "added" || (block.type === "changed" && block.new_text)) {
          return (
            <div key={`${i}-new`} className="flex bg-emerald-500/6 dark:bg-emerald-500/10 py-0.5">
              <div className="w-10 shrink-0" />
              <div className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-emerald-500/60">{block.new_line}</div>
              <div className="w-5 shrink-0 text-center font-mono text-[11px] font-bold text-emerald-500">+</div>
              <div className="flex-1 font-mono text-[13px] leading-[1.6] text-emerald-700 dark:text-emerald-400">{block.new_text}</div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function DocumentDiffDialog({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  useEffect(() => {
    setLoading(true);
    getDocumentDiff(documentId)
      .then((d) => setData(d as unknown as DiffData))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col doc-viewer-bg">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-black/8 dark:border-white/8 px-6 py-3 shrink-0 backdrop-blur-sm bg-[#faf8f4]/80 dark:bg-[#1a1814]/80">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
          <div className="h-4 w-px bg-border" />
          <div>
            <h2 className="text-sm font-semibold">Document Comparison</h2>
            {data && (
              <p className="text-[11px] text-muted-foreground">
                {Math.round(data.similarity_score * 100)}% similar
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {data && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-600">
                <Plus className="size-3" />
                {data.stats.additions}
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <Minus className="size-3" />
                {data.stats.deletions}
              </span>
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-[11px]">
            <button
              onClick={() => setViewMode("split")}
              className={`px-2.5 py-1 font-medium transition-colors ${viewMode === "split" ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              Split
            </button>
            <button
              onClick={() => setViewMode("unified")}
              className={`px-2.5 py-1 font-medium transition-colors ${viewMode === "unified" ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              Unified
            </button>
          </div>

          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-md hover:bg-foreground/5">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* File tabs (like GitHub) */}
      {data && (
        <div className="flex items-center gap-0 border-b border-black/5 dark:border-white/5 px-6 text-xs bg-[#faf8f4]/50 dark:bg-[#1a1814]/50">
          <div className="flex items-center gap-2 border-r px-4 py-2.5">
            <span className="rounded bg-red-500/15 px-1 py-0.5 font-mono text-[10px] font-bold text-red-600">OLD</span>
            <span className="text-muted-foreground">{data.original_filename}</span>
            <span className="text-muted-foreground/50">{data.original_chars.toLocaleString()} chars</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[10px] font-bold text-emerald-600">NEW</span>
            <span className="text-muted-foreground">{data.new_filename}</span>
            <span className="text-muted-foreground/50">{data.new_chars.toLocaleString()} chars</span>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive max-w-md">
            {error}
          </div>
        </div>
      ) : data && data.diff_blocks ? (
        <div className="flex-1 overflow-y-auto doc-reader-scroll">
          <div className="mx-auto max-w-[1100px] px-4 py-4">
            <div className="rounded-lg border overflow-hidden">
              {viewMode === "split"
                ? <SplitDiffView blocks={data.diff_blocks} />
                : <UnifiedDiffView blocks={data.diff_blocks} />
              }
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          No differences found.
        </div>
      )}
    </div>,
    document.body
  );
}
