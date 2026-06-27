"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, FileText, ChevronLeft } from "lucide-react";
import { getDocumentContent, getAnnotations, type DocumentAnnotation } from "@/lib/backend";

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG = {
  issue: {
    label: "Legal Issue",
    bg: "bg-red-500/12",
    hoverBg: "hover:bg-red-500/20",
    activeBg: "bg-red-500/25",
    border: "border-red-400/60",
    badge: "bg-red-500",
    stickyBg: "bg-gradient-to-br from-red-100 to-red-200 dark:from-red-950/80 dark:to-red-900/60",
    text: "text-red-800 dark:text-red-200",
  },
  weak_argument: {
    label: "Weak Argument",
    bg: "bg-orange-500/12",
    hoverBg: "hover:bg-orange-500/20",
    activeBg: "bg-orange-500/25",
    border: "border-orange-400/60",
    badge: "bg-orange-500",
    stickyBg: "bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-950/80 dark:to-orange-900/60",
    text: "text-orange-800 dark:text-orange-200",
  },
  grammar: {
    label: "Grammar",
    bg: "bg-yellow-500/12",
    hoverBg: "hover:bg-yellow-500/20",
    activeBg: "bg-yellow-500/25",
    border: "border-yellow-400/60",
    badge: "bg-yellow-500",
    stickyBg: "bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-950/80 dark:to-yellow-900/60",
    text: "text-yellow-800 dark:text-yellow-200",
  },
  suggestion: {
    label: "Suggestion",
    bg: "bg-blue-500/12",
    hoverBg: "hover:bg-blue-500/20",
    activeBg: "bg-blue-500/25",
    border: "border-blue-400/60",
    badge: "bg-blue-500",
    stickyBg: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-950/80 dark:to-blue-900/60",
    text: "text-blue-800 dark:text-blue-200",
  },
  strength: {
    label: "Strength",
    bg: "bg-emerald-500/12",
    hoverBg: "hover:bg-emerald-500/20",
    activeBg: "bg-emerald-500/25",
    border: "border-emerald-400/60",
    badge: "bg-emerald-500",
    stickyBg: "bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-950/80 dark:to-emerald-900/60",
    text: "text-emerald-800 dark:text-emerald-200",
  },
  change: {
    label: "Change",
    bg: "bg-purple-500/12",
    hoverBg: "hover:bg-purple-500/20",
    activeBg: "bg-purple-500/25",
    border: "border-purple-400/60",
    badge: "bg-purple-500",
    stickyBg: "bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-950/80 dark:to-purple-900/60",
    text: "text-purple-800 dark:text-purple-200",
  },
} as const;

const SEVERITY_STYLES = {
  high: "bg-red-500/20 text-red-700 dark:text-red-300",
  medium: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  low: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAnnotatedSegments(
  text: string,
  annotations: DocumentAnnotation[]
): { text: string; annotationIndex: number | null }[] {
  if (annotations.length === 0) {
    return [{ text, annotationIndex: null }];
  }

  const sorted = [...annotations].sort((a, b) => a.span_start - b.span_start);
  const segments: { text: string; annotationIndex: number | null }[] = [];
  let cursor = 0;

  for (const ann of sorted) {
    const annIdx = annotations.indexOf(ann);
    if (ann.span_start > cursor) {
      segments.push({ text: text.slice(cursor, ann.span_start), annotationIndex: null });
    }
    if (ann.span_start >= cursor) {
      segments.push({ text: text.slice(ann.span_start, ann.span_end), annotationIndex: annIdx });
      cursor = ann.span_end;
    }
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), annotationIndex: null });
  }

  return segments;
}

/** Split text into paragraphs for proper rendering */
function renderParagraphs(
  segments: { text: string; annotationIndex: number | null }[],
  annotations: DocumentAnnotation[],
  activeAnnotation: number | null,
  highlightRefs: React.MutableRefObject<Map<number, HTMLSpanElement>>,
  onHighlightClick: (index: number) => void,
) {
  // Join all segments into one string with annotation markers, then split by newlines
  // Simpler approach: render segments inline, let CSS handle paragraph breaks
  return segments.map((seg, i) => {
    if (seg.annotationIndex === null) {
      // Split plain text by double newlines for paragraph breaks
      const parts = seg.text.split(/\n{2,}/);
      return parts.map((part, j) => (
        <span key={`${i}-${j}`}>
          {j > 0 && <span className="block h-5" />}
          <span className="whitespace-pre-wrap">{part}</span>
        </span>
      ));
    }

    const ann = annotations[seg.annotationIndex];
    const config = CATEGORY_CONFIG[ann.category] || CATEGORY_CONFIG.change;
    const isActive = activeAnnotation === seg.annotationIndex;

    return (
      <span
        key={i}
        ref={(el) => {
          if (el) highlightRefs.current.set(seg.annotationIndex!, el);
        }}
        onClick={() => onHighlightClick(seg.annotationIndex!)}
        className={`relative cursor-pointer rounded px-0.5 py-px border-b-2 transition-all duration-300 ${config.bg} ${config.border} ${
          isActive ? config.activeBg + " ring-2 ring-offset-2 ring-foreground/15 dark:ring-offset-[#1a1814]" : config.hoverBg
        }`}
      >
        {seg.text}
        <span className={`absolute -top-2.5 -right-2 flex size-[18px] items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm ${config.badge}`}>
          {seg.annotationIndex! + 1}
        </span>
      </span>
    );
  });
}

// ---------------------------------------------------------------------------
// Post-it note
// ---------------------------------------------------------------------------

function PostItNote({
  annotation,
  index,
  active,
  onClick,
}: {
  annotation: DocumentAnnotation;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const config = CATEGORY_CONFIG[annotation.category] || CATEGORY_CONFIG.change;
  const noteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active && noteRef.current) {
      noteRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active]);

  const rotations = ["-rotate-[0.6deg]", "rotate-[0.4deg]", "-rotate-[0.3deg]", "rotate-[0.7deg]", "-rotate-[0.5deg]"];
  const rotation = rotations[index % rotations.length];

  return (
    <div
      ref={noteRef}
      onClick={onClick}
      className={`relative cursor-pointer rounded-[3px] p-5 pb-6 shadow-md transition-all duration-300 ${config.stickyBg} ${rotation} ${
        active
          ? "!rotate-0 !-translate-y-1 shadow-xl ring-2 ring-foreground/20 scale-[1.02]"
          : "hover:!rotate-0 hover:-translate-y-0.5 hover:shadow-lg"
      }`}
    >
      {/* Pin */}
      <div className="absolute -top-1.5 left-1/2 size-3.5 -translate-x-1/2 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 dark:from-gray-500 dark:to-gray-700 shadow-sm ring-1 ring-black/10" />

      {/* Number badge */}
      <div className={`absolute right-3 top-3 flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ${config.badge}`}>
        {index + 1}
      </div>

      {/* Category + severity */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.text} opacity-80`}>
          {config.label}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${SEVERITY_STYLES[annotation.severity]}`}>
          {annotation.severity}
        </span>
      </div>

      {/* Note text */}
      <p className="text-[14px] leading-[1.55] text-gray-800 dark:text-gray-100">
        {annotation.note}
      </p>

      {/* Quote */}
      {annotation.quote && (
        <p className="mt-3 border-t border-dashed border-black/10 dark:border-white/10 pt-2.5 text-[12px] italic leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
          &ldquo;{annotation.quote}&rdquo;
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main viewer — full-screen overlay, Kindle-style reading experience
// ---------------------------------------------------------------------------

export function DocumentViewer({
  documentId,
  filename,
  parentFilename,
  onClose,
}: {
  documentId: string;
  filename: string;
  parentFilename?: string | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null);
  const highlightRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDocumentContent(documentId),
      getAnnotations(documentId).catch(() => ({ annotations: [], cached: false })),
    ])
      .then(([contentData, annData]) => {
        setContent(contentData.content);
        setAnnotations(annData.annotations || []);
      })
      .catch(() => setContent("Could not load document."))
      .finally(() => setLoading(false));
  }, [documentId]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleHighlightClick = useCallback((index: number) => {
    setActiveAnnotation(index);
  }, []);

  const handleNoteClick = useCallback((index: number) => {
    setActiveAnnotation(index);
    const el = highlightRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const segments = content ? buildAnnotatedSegments(content, annotations) : [];

  const statCounts = annotations.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col doc-viewer-bg">
      {/* ── Top bar ── */}
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
          <FileText className="size-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">{filename}</h2>
            {parentFilename && (
              <p className="text-[11px] text-muted-foreground">
                Compared against: {parentFilename}
              </p>
            )}
          </div>
        </div>

        {/* Annotation stats */}
        {annotations.length > 0 && (
          <div className="flex items-center gap-4">
            {Object.entries(statCounts).map(([cat, count]) => {
              const config = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG];
              if (!config) return null;
              return (
                <div key={cat} className="flex items-center gap-1.5 text-xs">
                  <div className={`size-2 rounded-full ${config.badge}`} />
                  <span className="text-muted-foreground">{config.label}</span>
                  <span className="font-semibold tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-foreground/5"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </header>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading document...</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: Document reading pane ── */}
          <div className="flex-1 overflow-y-auto doc-reader-scroll">
            <article className="mx-auto max-w-[680px] px-8 py-12 pb-32">
              {/* Document title */}
              <header className="mb-10 text-center border-b-2 border-foreground/10 pb-8">
                <h1 className="text-xl font-semibold tracking-tight text-foreground mb-1">
                  {filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")}
                </h1>
                <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
                  Legal Document
                </p>
              </header>

              {/* Document body — serif font, generous line height */}
              <div className="doc-body text-[16px] leading-[1.9] text-foreground/85">
                {renderParagraphs(segments, annotations, activeAnnotation, highlightRefs, handleHighlightClick)}
              </div>

              {/* End mark */}
              <div className="mt-16 flex justify-center">
                <div className="flex items-center gap-3 text-muted-foreground/40">
                  <div className="h-px w-12 bg-current" />
                  <span className="text-[10px] uppercase tracking-[0.3em]">End of document</span>
                  <div className="h-px w-12 bg-current" />
                </div>
              </div>
            </article>
          </div>

          {/* ── Right: Annotation sidebar ── */}
          {annotations.length > 0 && (
            <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-black/5 dark:border-white/5 doc-sidebar-bg px-5 py-8 space-y-5">
              <div className="flex items-center gap-2 mb-6">
                <div className="h-px flex-1 bg-foreground/10" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  AI Review Notes
                </span>
                <div className="h-px flex-1 bg-foreground/10" />
              </div>

              {annotations.map((ann, i) => (
                <PostItNote
                  key={ann.id}
                  annotation={ann}
                  index={i}
                  active={activeAnnotation === i}
                  onClick={() => handleNoteClick(i)}
                />
              ))}
            </aside>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
