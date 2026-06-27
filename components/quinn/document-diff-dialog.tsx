"use client";

import { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { getDocumentDiff } from "@/lib/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface DiffData {
  original_filename: string;
  new_filename: string;
  similarity_score: number;
  diff_summary: string;
  original_chars: number;
  new_chars: number;
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+")) {
    return (
      <div className="bg-emerald-500/10 px-3 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-400">
        {line}
      </div>
    );
  }
  if (line.startsWith("-")) {
    return (
      <div className="bg-red-500/10 px-3 py-0.5 font-mono text-xs text-red-700 dark:text-red-400">
        {line}
      </div>
    );
  }
  return (
    <div className="px-3 py-0.5 font-mono text-xs text-muted-foreground">
      {line}
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

  useEffect(() => {
    setLoading(true);
    getDocumentDiff(documentId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [documentId]);

  const diffLines = data?.diff_summary?.split("\n").filter(Boolean) ?? [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Document Comparison</DialogTitle>
          {data && (
            <DialogDescription>
              {data.original_filename} → {data.new_filename}
              {" · "}
              {Math.round(data.similarity_score * 100)}% similar
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Stats */}
            <div className="flex gap-4 text-xs text-muted-foreground border-b pb-3">
              <span>Original: {data.original_chars.toLocaleString()} chars</span>
              <span>New: {data.new_chars.toLocaleString()} chars</span>
              <span>
                {diffLines.filter((l) => l.startsWith("+")).length} additions,{" "}
                {diffLines.filter((l) => l.startsWith("-")).length} deletions
              </span>
            </div>

            {/* Diff view */}
            <div className="flex-1 overflow-y-auto rounded-md border bg-muted/20">
              {diffLines.length > 0 ? (
                diffLines.map((line, i) => <DiffLine key={i} line={line} />)
              ) : (
                <div className="p-4 text-sm text-muted-foreground">
                  No differences found (documents are identical).
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
