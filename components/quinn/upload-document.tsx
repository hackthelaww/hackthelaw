"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, CheckCircle2, Sparkles, User, Bot, AlertTriangle, FileText, ArrowUpRight } from "lucide-react";
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

type Step = "pick-files" | "source" | "review-similar" | "processing" | "done";

interface PendingFile {
  index: number;
  file: File;
  uploadData: Record<string, unknown>;
  similarity: SimilarityInfo | null;
  semanticMatch: SemanticMatchInfo | null;
  decision: "upload" | "skip" | "pending";
}

interface SimilarityInfo {
  status: string;
  score: number;
  matched_filename: string | null;
  diff_summary: string | null;
}

interface SemanticMatchInfo {
  relationship: string;
  confidence: number;
  explanation: string;
  key_changes: string[];
  matched_filename: string | null;
}

interface FileResult {
  filename: string;
  status: "success" | "error" | "duplicate" | "near_duplicate" | "evolved_version";
  entities_extracted?: number;
  relations_extracted?: number;
  similarity?: SimilarityInfo | null;
  semantic_match?: SemanticMatchInfo | null;
  error?: string;
  upload_id?: string;
  document_id?: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    // getUser() is more reliable than getSession() for getting the current token
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    // Fallback: try refreshing
    const { data } = await supabase.auth.refreshSession();
    if (data.session?.access_token) {
      return { Authorization: `Bearer ${data.session.access_token}` };
    }
  } catch { /* no auth */ }
  return {};
}

const PROCESSING_MESSAGES = [
  "Reading document contents...",
  "Extracting text and metadata...",
  "Scanning for similar documents...",
  "Building knowledge graph...",
  "Identifying parties and entities...",
  "Mapping relationships...",
  "Analyzing obligations and deadlines...",
  "Cross-referencing with existing data...",
  "Detecting key clauses...",
  "Almost there...",
];

function ProcessingView({
  files, currentIndex, loading, results, error, onClose,
}: {
  files: File[];
  currentIndex: number;
  loading: boolean;
  results: FileResult[];
  error: string | null;
  onClose: () => void;
}) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // Reset message index when file changes
  useEffect(() => {
    setMsgIndex(0);
  }, [currentIndex]);

  const elapsed = results.length;
  const total = files.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Analyzing documents...</DialogTitle>
        <DialogDescription>
          File {Math.min(currentIndex + 1, total)} of {total}
          {elapsed > 0 && ` · ${elapsed} done`}
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/60 transition-all duration-700 ease-out"
            style={{ width: `${((currentIndex + (loading ? 0.5 : 1)) / total) * 100}%` }}
          />
        </div>

        {/* Animated status */}
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <div className="relative flex items-center justify-center">
            <div className="absolute size-10 animate-ping rounded-full bg-amber-500/10" />
            <Sparkles className="relative size-6 animate-pulse text-amber-500" />
          </div>
          <span className="text-sm font-medium truncate max-w-[280px]">
            {files[currentIndex]?.name ?? "..."}
          </span>
          <span
            key={msgIndex}
            className="text-xs text-muted-foreground animate-fade-in"
          >
            {PROCESSING_MESSAGES[msgIndex]}
          </span>
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
                    ~{Math.round((r.similarity?.score ?? 0) * 100)}% match
                  </span>
                )}
                {r.status === "duplicate" && (
                  <span className="ml-auto shrink-0 text-red-400">duplicate</span>
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
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </div>
      )}
    </>
  );
}

export function UploadDocumentButton({ matterId }: { matterId?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick-files");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [fileSources, setFileSources] = useState<Record<number, "human" | "ai">>({});
  const [results, setResults] = useState<FileResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [simulatedDate, setSimulatedDate] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [matterId_internal, setMatterId_internal] = useState("");

  function reset() {
    setStep("pick-files");
    setError(null);
    setLoading(false);
    setFiles([]);
    setFileSources({});
    setResults([]);
    setCurrentIndex(0);
    setSimulatedDate("");
    setPendingFiles([]);
    setMatterId_internal("");
  }

  function handleFilesSelected() {
    const selected = fileRef.current?.files;
    if (!selected || selected.length === 0) return;
    setFiles(Array.from(selected));
    setStep("source");
  }

  async function handleSourceSelected(_unused: "human" | "ai") {
    setStep("processing");
    setLoading(true);
    setError(null);

    const authHeaders = await getAuthHeaders();
    const mId = matterId ?? `matter-${Date.now()}`;
    setMatterId_internal(mId);

    // Auto-create case if none provided
    if (!matterId) {
      try {
        await fetch(`${BACKEND}/api/cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ id: mId, name: `Case ${new Date().toLocaleDateString()}`, description: "" }),
        });
      } catch { /* case may already exist */ }
    }

    // Phase 1: Upload all files and collect similarity info
    const pending: PendingFile[] = [];
    const autoResults: FileResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentIndex(i);

      try {
        const form = new FormData();
        form.append("file", file);
        form.append("matter_id", mId);
        if (simulatedDate) form.append("simulated_date", simulatedDate);

        const uploadRes = await fetch(`${BACKEND}/api/documents/upload`, {
          method: "POST",
          headers: authHeaders,
          body: form,
        });
        if (!uploadRes.ok) throw new Error(await uploadRes.text());
        const uploadData = await uploadRes.json();

        const similarity: SimilarityInfo | null = uploadData.similarity ?? null;
        const semanticMatch: SemanticMatchInfo | null = uploadData.semantic_match ?? null;

        // Exact duplicates are auto-skipped
        if (similarity?.status === "exact_duplicate") {
          autoResults.push({ filename: file.name, status: "duplicate", similarity });
          continue;
        }

        // Only flag for user decision if ≥99% match (near-identical)
        const isFlagged = similarity?.status === "near_duplicate" &&
          (similarity?.score ?? 0) >= 0.99;

        pending.push({
          index: i,
          file,
          uploadData,
          similarity,
          semanticMatch,
          decision: isFlagged ? "pending" : "upload",
        });
      } catch (e) {
        autoResults.push({
          filename: file.name,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    setResults(autoResults);

    // If any files need review, pause for user decision
    const needsReview = pending.filter((p) => p.decision === "pending");
    if (needsReview.length > 0) {
      setPendingFiles(pending);
      setLoading(false);
      setStep("review-similar");
      return;
    }

    // Otherwise, process all immediately
    setPendingFiles(pending);
    await processApprovedFiles(pending, autoResults, authHeaders);
  }

  async function processApprovedFiles(
    pending: PendingFile[],
    existingResults: FileResult[],
    authHeaders: Record<string, string>,
  ) {
    setStep("processing");
    setLoading(true);
    const allResults = [...existingResults];

    const toProcess = pending.filter((p) => p.decision !== "skip");

    for (let j = 0; j < toProcess.length; j++) {
      const p = toProcess[j];
      setCurrentIndex(j);

      try {
        const fileSource = fileSources[p.index] ?? "human";
        const confirmRes = await fetch(`${BACKEND}/api/documents/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            upload_id: p.uploadData.upload_id,
            source: fileSource,
            author: fileSource === "human" ? "uploaded by user" : null,
            model: fileSource === "ai" ? "unknown" : null,
            doc_type: "",
          }),
        });
        if (!confirmRes.ok) throw new Error(await confirmRes.text());
        const confirmed = await confirmRes.json();

        const extractRes = await fetch(
          `${BACKEND}/api/documents/${encodeURIComponent(confirmed.document_id)}/extract`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ provider: "anthropic", model_name: "claude-haiku-4-5-20251001" }),
          }
        );
        if (!extractRes.ok) throw new Error(await extractRes.text());
        const extractData = await extractRes.json();

        // Auto-link versions
        if (p.similarity?.status === "near_duplicate" && p.uploadData.similarity?.matched_document_id) {
          try {
            await fetch(`${BACKEND}/api/documents/link-version`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({
                new_document_id: (p.uploadData as Record<string, unknown>).case_doc_id || confirmed.document_id,
                parent_document_id: (p.uploadData.similarity as SimilarityInfo).matched_document_id,
              }),
            });
          } catch { /* not critical */ }
        }

        const docStatus = p.semanticMatch?.relationship === "evolved_version"
          ? "evolved_version" as const
          : p.similarity?.status === "near_duplicate"
            ? "near_duplicate" as const
            : "success" as const;

        allResults.push({
          filename: p.file.name,
          status: docStatus,
          entities_extracted: extractData.entities_extracted,
          relations_extracted: extractData.relations_extracted,
          similarity: p.similarity,
          semantic_match: p.semanticMatch,
          document_id: confirmed.document_id,
        });
      } catch (e) {
        allResults.push({
          filename: p.file.name,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }

      setResults([...allResults]);
    }

    // Add skipped files to results
    for (const p of pending.filter((p) => p.decision === "skip")) {
      allResults.push({
        filename: p.file.name,
        status: "duplicate",
        similarity: p.similarity,
      });
    }

    setResults(allResults);
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
                <span className="text-xs text-muted-foreground">PDF, TXT, MD, PNG, JPG, EML, ODT, DOCX</span>
                <input
                  id="doc-files"
                  type="file"
                  accept=".pdf,.txt,.md,.text,.png,.jpg,.jpeg,.eml,.odt,.docx"
                  multiple
                  className="hidden"
                  ref={fileRef}
                  onChange={handleFilesSelected}
                />
              </label>

              {/* Simulated date for demo/testing */}
              <div className="mt-3 flex items-center gap-2">
                <label htmlFor="sim-date" className="text-xs text-muted-foreground whitespace-nowrap">
                  Simulate upload date:
                </label>
                <input
                  id="sim-date"
                  type="date"
                  value={simulatedDate}
                  onChange={(e) => setSimulatedDate(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
                {simulatedDate && (
                  <button
                    onClick={() => setSimulatedDate("")}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    clear
                  </button>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Step 2: Source — per-file human or AI toggle */}
        {step === "source" && (
          <>
            <DialogHeader>
              <DialogTitle>Mark each file as human or AI generated</DialogTitle>
              <DialogDescription>
                {files.length} file{files.length > 1 ? "s" : ""} selected — click to toggle
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-52 overflow-y-auto py-2">
              <div className="space-y-1.5">
                {files.map((f, i) => {
                  const src = fileSources[i] ?? "human";
                  const isAI = src === "ai";
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs rounded-md border p-2">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{(f.size / 1024).toFixed(0)}KB</span>
                      <button
                        onClick={() => setFileSources((prev) => ({ ...prev, [i]: isAI ? "human" : "ai" }))}
                        className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                          isAI
                            ? "bg-blue-500/15 text-blue-600 ring-1 ring-blue-500/30"
                            : "bg-foreground/8 text-foreground/60"
                        }`}
                      >
                        {isAI ? <Bot className="size-3" /> : <User className="size-3" />}
                        {isAI ? "AI" : "Human"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <button
                onClick={() => {
                  const allHuman: Record<number, "human" | "ai"> = {};
                  files.forEach((_, i) => { allHuman[i] = "human"; });
                  setFileSources(allHuman);
                }}
                className="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                All human
              </button>
              <button
                onClick={() => {
                  const allAI: Record<number, "human" | "ai"> = {};
                  files.forEach((_, i) => { allAI[i] = "ai"; });
                  setFileSources(allAI);
                }}
                className="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                All AI
              </button>
              <button
                onClick={() => handleSourceSelected("human")}
                disabled={loading}
                className="flex-1 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
              >
                Continue
              </button>
            </div>

            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Step 2.5: Review similar documents */}
        {step === "review-similar" && (
          <>
            <DialogHeader>
              <DialogTitle>Similar documents detected</DialogTitle>
              <DialogDescription>
                Some files appear to match existing documents. Choose what to do with each.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-64 overflow-y-auto py-2 space-y-2">
              {pendingFiles.filter((p) => p.decision === "pending" || p.decision === "skip").map((p) => {
                const isFlagged = p.decision === "pending" || p.decision === "skip";
                const matchName = p.semanticMatch?.matched_filename || p.similarity?.matched_filename || "existing document";
                const isEvolved = p.semanticMatch?.relationship === "evolved_version";
                const score = p.similarity?.score ?? p.semanticMatch?.confidence ?? 0;

                return (
                  <div key={p.index} className={`rounded-md border p-3 space-y-2 ${p.decision === "skip" ? "opacity-50" : ""}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${isEvolved ? "text-blue-500" : "text-amber-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.file.name}</div>
                        <div className={`text-xs ${isEvolved ? "text-blue-600" : "text-amber-600"}`}>
                          {isEvolved
                            ? `Evolved version of "${matchName}"`
                            : `~${Math.round(score * 100)}% similar to "${matchName}"`}
                        </div>
                        {p.semanticMatch?.explanation && (
                          <p className="mt-1 text-[11px] text-muted-foreground">{p.semanticMatch.explanation}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pl-6">
                      <button
                        onClick={() => setPendingFiles((prev) =>
                          prev.map((f) => f.index === p.index ? { ...f, decision: "upload" } : f)
                        )}
                        className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          p.decision === "upload"
                            ? "bg-foreground text-background"
                            : "border hover:bg-muted"
                        }`}
                      >
                        Upload anyway
                      </button>
                      <button
                        onClick={() => setPendingFiles((prev) =>
                          prev.map((f) => f.index === p.index ? { ...f, decision: "skip" } : f)
                        )}
                        className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          p.decision === "skip"
                            ? "bg-foreground text-background"
                            : "border hover:bg-muted"
                        }`}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Non-flagged files (auto-approved) */}
              {pendingFiles.filter((p) => p.decision === "upload" && !(p.similarity?.status === "near_duplicate" || p.similarity?.status === "similar" || p.semanticMatch?.relationship === "evolved_version")).map((p) => (
                <div key={p.index} className="flex items-center gap-2 rounded-md border p-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">{p.file.name}</span>
                  <span className="ml-auto text-emerald-600">New — will upload</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-3">
              <button
                onClick={async () => {
                  const authHeaders = await getAuthHeaders();
                  await processApprovedFiles(pendingFiles, results, authHeaders);
                }}
                className="flex-1 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
              >
                Continue with selected
              </button>
            </div>
          </>
        )}

        {/* Step 3: Processing */}
        {step === "processing" && (
          <ProcessingView
            files={files}
            currentIndex={currentIndex}
            loading={loading}
            results={results}
            error={error}
            onClose={() => { setOpen(false); reset(); }}
          />
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
                  {r.status === "evolved_version" && <ArrowUpRight className="size-3.5 mt-0.5 text-blue-500 shrink-0" />}
                  {r.status === "near_duplicate" && <AlertTriangle className="size-3.5 mt-0.5 text-amber-500 shrink-0" />}
                  {r.status === "duplicate" && <AlertTriangle className="size-3.5 mt-0.5 text-red-400 shrink-0" />}
                  {r.status === "error" && <AlertTriangle className="size-3.5 mt-0.5 text-destructive shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.filename}</div>
                    {r.status === "success" && (
                      <div className="text-muted-foreground">{r.entities_extracted} entities, {r.relations_extracted} relations</div>
                    )}
                    {r.status === "evolved_version" && (
                      <div className="text-blue-600">
                        Evolved version of {r.semantic_match?.matched_filename ?? r.similarity?.matched_filename}
                        {r.semantic_match?.explanation && <span className="text-muted-foreground"> — {r.semantic_match.explanation}</span>}
                        {r.semantic_match?.key_changes && r.semantic_match.key_changes.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                            {r.semantic_match.key_changes.map((c, j) => <li key={j}>{c}</li>)}
                          </ul>
                        )}
                      </div>
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
