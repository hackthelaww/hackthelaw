"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle2, Sparkles, User, Bot, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Step = "pick-files" | "source" | "processing" | "done";

interface SimilarityInfo {
  status: string;
  score: number;
  matched_filename: string | null;
  diff_summary: string | null;
}

interface FileResult {
  filename: string;
  status: "success" | "error" | "duplicate" | "near_duplicate";
  entities_extracted?: number;
  relations_extracted?: number;
  similarity?: SimilarityInfo | null;
  error?: string;
  upload_id?: string;
  document_id?: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch { /* no auth */ }
  return {};
}

export function UploadDocumentButton({ matterId }: { matterId?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick-files");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<"human" | "ai" | null>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  function reset() {
    setStep("pick-files");
    setError(null);
    setLoading(false);
    setFiles([]);
    setSource(null);
    setResults([]);
    setCurrentIndex(0);
  }

  function handleFilesSelected() {
    const selected = fileRef.current?.files;
    if (!selected || selected.length === 0) return;
    setFiles(Array.from(selected));
    setStep("source");
  }

  async function handleSourceSelected(src: "human" | "ai") {
    setSource(src);
    setStep("processing");
    setLoading(true);
    setError(null);

    const authHeaders = await getAuthHeaders();
    const mId = matterId ?? `matter-${Date.now()}`;

    // Auto-create matter if none provided
    if (!matterId) {
      try {
        await fetch(`${BACKEND}/api/matters`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ id: mId, name: `Case ${new Date().toLocaleDateString()}`, description: "" }),
        });
      } catch { /* matter may already exist */ }
    }

    const allResults: FileResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentIndex(i);

      try {
        // 1. Upload
        const form = new FormData();
        form.append("file", file);
        form.append("matter_id", mId);

        const uploadRes = await fetch(`${BACKEND}/api/documents/upload`, {
          method: "POST",
          headers: authHeaders,
          body: form,
        });
        if (!uploadRes.ok) throw new Error(await uploadRes.text());
        const uploadData = await uploadRes.json();

        const similarity: SimilarityInfo | null = uploadData.similarity ?? null;

        // If exact duplicate, skip confirm + extract
        if (similarity?.status === "exact_duplicate") {
          allResults.push({
            filename: file.name,
            status: "duplicate",
            similarity,
          });
          setResults([...allResults]);
          continue;
        }

        // 2. Confirm
        const confirmRes = await fetch(`${BACKEND}/api/documents/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            upload_id: uploadData.upload_id,
            source: src,
            author: src === "human" ? "uploaded by user" : null,
            model: src === "ai" ? "unknown" : null,
            doc_type: "",
          }),
        });
        if (!confirmRes.ok) throw new Error(await confirmRes.text());
        const confirmed = await confirmRes.json();

        // 3. Extract
        const extractRes = await fetch(
          `${BACKEND}/api/documents/${encodeURIComponent(confirmed.document_id)}/extract`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              provider: "anthropic",
              model_name: "claude-haiku-4-5-20251001",
            }),
          }
        );
        if (!extractRes.ok) throw new Error(await extractRes.text());
        const extractData = await extractRes.json();

        allResults.push({
          filename: file.name,
          status: similarity?.status === "near_duplicate" ? "near_duplicate" : "success",
          entities_extracted: extractData.entities_extracted,
          relations_extracted: extractData.relations_extracted,
          similarity,
          document_id: confirmed.document_id,
        });
      } catch (e) {
        allResults.push({
          filename: file.name,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }

      setResults([...allResults]);
    }

    setLoading(false);
    setStep("done");
  }

  const totalEntities = results.reduce((sum, r) => sum + (r.entities_extracted ?? 0), 0);
  const totalRelations = results.reduce((sum, r) => sum + (r.relations_extracted ?? 0), 0);
  const successCount = results.filter((r) => r.status === "success" || r.status === "near_duplicate").length;
  const dupCount = results.filter((r) => r.status === "duplicate").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger
        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2.5 h-7 gap-1.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground"
      >
        <Upload className="size-3.5" />
        Upload documents
      </DialogTrigger>

      <DialogContent className="max-w-md">
        {/* Step 1: Pick files */}
        {step === "pick-files" && (
          <>
            <DialogHeader>
              <DialogTitle>Upload documents</DialogTitle>
              <DialogDescription>
                Select one or more files. The AI will analyze each and build your knowledge graph.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <label
                htmlFor="doc-files"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-10 text-center transition-colors hover:border-muted-foreground/50 hover:bg-muted/40"
              >
                <Upload className="size-8 text-muted-foreground/60" />
                <span className="text-sm font-medium">Click to select files</span>
                <span className="text-xs text-muted-foreground">PDF, TXT, MD, PNG, JPG, EML, ODT</span>
                <input
                  id="doc-files"
                  type="file"
                  accept=".pdf,.txt,.md,.text,.png,.jpg,.jpeg,.eml,.odt"
                  multiple
                  className="hidden"
                  ref={fileRef}
                  onChange={handleFilesSelected}
                />
              </label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Step 2: Source — human or AI? */}
        {step === "source" && (
          <>
            <DialogHeader>
              <DialogTitle>Are these documents human or AI generated?</DialogTitle>
              <DialogDescription>
                {files.length} file{files.length > 1 ? "s" : ""} selected
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-32 overflow-y-auto py-2">
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto shrink-0 tabular-nums">{(f.size / 1024).toFixed(0)}KB</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 py-4">
              <button
                onClick={() => handleSourceSelected("human")}
                disabled={loading}
                className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted-foreground/20 p-6 transition-all hover:border-foreground/40 hover:bg-muted/40 active:scale-[0.98]"
              >
                <User className="size-8 text-muted-foreground" />
                <span className="text-sm font-medium">Human-authored</span>
              </button>
              <button
                onClick={() => handleSourceSelected("ai")}
                disabled={loading}
                className="flex flex-col items-center gap-3 rounded-lg border-2 border-muted-foreground/20 p-6 transition-all hover:border-foreground/40 hover:bg-muted/40 active:scale-[0.98]"
              >
                <Bot className="size-8 text-muted-foreground" />
                <span className="text-sm font-medium">AI-generated</span>
              </button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Step 3: Processing */}
        {step === "processing" && (
          <>
            <DialogHeader>
              <DialogTitle>Analyzing documents...</DialogTitle>
              <DialogDescription>
                Processing file {currentIndex + 1} of {files.length}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              {/* Progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground/60 transition-all duration-500"
                  style={{ width: `${((currentIndex + (loading ? 0.5 : 1)) / files.length) * 100}%` }}
                />
              </div>

              {/* Current file */}
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Sparkles className="size-5 animate-pulse text-amber-500" />
                <span className="text-sm">{files[currentIndex]?.name ?? "..."}</span>
              </div>

              {/* Completed results so far */}
              {results.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.status === "success" && <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />}
                      {r.status === "near_duplicate" && <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />}
                      {r.status === "duplicate" && <AlertTriangle className="size-3.5 text-red-400 shrink-0" />}
                      {r.status === "error" && <AlertTriangle className="size-3.5 text-destructive shrink-0" />}
                      <span className="truncate">{r.filename}</span>
                      {r.status === "success" && (
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {r.entities_extracted} entities
                        </span>
                      )}
                      {r.status === "near_duplicate" && (
                        <span className="ml-auto shrink-0 text-amber-500">
                          ~{Math.round((r.similarity?.score ?? 0) * 100)}% match with {r.similarity?.matched_filename}
                        </span>
                      )}
                      {r.status === "duplicate" && (
                        <span className="ml-auto shrink-0 text-red-400">
                          duplicate of {r.similarity?.matched_filename}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Close</Button>
                </DialogFooter>
              </div>
            )}
          </>
        )}

        {/* Step 4: Done */}
        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-500" />
                Done
              </DialogTitle>
              <DialogDescription>
                {successCount} processed, {totalEntities} entities, {totalRelations} relationships
                {dupCount > 0 && ` · ${dupCount} duplicate${dupCount > 1 ? "s" : ""} skipped`}
                {errorCount > 0 && ` · ${errorCount} failed`}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-60 overflow-y-auto py-2 space-y-1.5">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs rounded-md border p-2">
                  {r.status === "success" && <CheckCircle2 className="size-3.5 mt-0.5 text-emerald-500 shrink-0" />}
                  {r.status === "near_duplicate" && <AlertTriangle className="size-3.5 mt-0.5 text-amber-500 shrink-0" />}
                  {r.status === "duplicate" && <AlertTriangle className="size-3.5 mt-0.5 text-red-400 shrink-0" />}
                  {r.status === "error" && <AlertTriangle className="size-3.5 mt-0.5 text-destructive shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.filename}</div>
                    {r.status === "success" && (
                      <div className="text-muted-foreground">{r.entities_extracted} entities, {r.relations_extracted} relations</div>
                    )}
                    {r.status === "near_duplicate" && (
                      <div className="text-amber-600">
                        Near-duplicate (~{Math.round((r.similarity?.score ?? 0) * 100)}%) of {r.similarity?.matched_filename}
                        {r.entities_extracted ? ` · ${r.entities_extracted} entities extracted` : ""}
                      </div>
                    )}
                    {r.status === "duplicate" && (
                      <div className="text-red-500">Exact duplicate of {r.similarity?.matched_filename} — skipped</div>
                    )}
                    {r.status === "error" && (
                      <div className="text-destructive">{r.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); window.location.reload(); }}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
