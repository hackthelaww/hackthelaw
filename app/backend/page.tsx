"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listMatters } from "@/lib/backend";

// NVL's base library touches `document` at import time — client-only.
const BackendGraph = dynamic(() => import("@/components/quinn/backend-graph").then((m) => m.BackendGraph), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading graph…</div>,
});

interface MatterRow {
  matter: { id: string; name: string; description: string | null; client: string | null; tags: string[] | null };
  party_count: number;
  doc_count: number;
  deadline_count: number;
}

/**
 * Obviously-fake fixture data — never confused for real output. This is the
 * one deliberate exception to "no fabricated data" in the app, scoped to
 * this isolated demo page so you can compare layout against the live
 * FastAPI backend without depending on it being up.
 */
const STATIC_DEMO_MATTERS: MatterRow[] = [
  {
    matter: {
      id: "demo-northwind-v-example",
      name: "[DEMO] Northwind Trading Co. v. Example Corp",
      description: "Static placeholder — not a real matter.",
      client: "Northwind Trading Co. (fictional)",
      tags: ["demo", "static"],
    },
    party_count: 2,
    doc_count: 4,
    deadline_count: 1,
  },
  {
    matter: {
      id: "demo-acme-dpa",
      name: "[DEMO] Acme vendor DPA review",
      description: "Static placeholder — not a real matter.",
      client: "Acme Corp (fictional)",
      tags: ["demo", "static"],
    },
    party_count: 1,
    doc_count: 2,
    deadline_count: 0,
  },
];

export default function BackendDemoPage() {
  const [source, setSource] = useState<"static" | "live">("live");
  const [liveMatters, setLiveMatters] = useState<MatterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatterId, setSelectedMatterId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (source !== "live") return;
    let cancelled = false;
    listMatters()
      .then((body) => {
        if (cancelled) return;
        setLiveMatters(body as MatterRow[]);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLiveMatters(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const matters = source === "static" ? STATIC_DEMO_MATTERS : liveMatters;

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col px-10 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Backend integration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Calls Igor&apos;s FastAPI service directly (lib/backend.ts → localhost:8000) — a separate data model
          (matters/parties/documents/deadlines) from the Quinn clause-analysis graph elsewhere in the app.
        </p>
      </div>

      <Tabs
        value={source}
        onValueChange={(v) => {
          const next = (v ?? "live") as "static" | "live";
          setSource(next);
          if (next === "static") setError(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="live">Live backend (:8000)</TabsTrigger>
          <TabsTrigger value="static">Static demo data</TabsTrigger>
        </TabsList>
      </Tabs>

      {source === "static" && (
        <p className="mt-3 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          Showing hardcoded placeholder data — not from any live source.
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}. Is the backend running? <code>cd backend && .venv/bin/uvicorn app.main:app --port 8000</code>
        </div>
      )}

      {!error && matters && (
        <div className="mt-4 flex flex-1 gap-6">
          <div className="w-72 shrink-0">
            <ul>
              {matters.map((row) => (
                <li key={row.matter.id} className="border-b">
                  <button
                    onClick={() => setSelectedMatterId(row.matter.id)}
                    className={`flex w-full flex-col gap-0.5 py-3 text-left transition-colors hover:bg-muted/40 ${
                      selectedMatterId === row.matter.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground">{row.matter.name}</span>
                    <span className="text-xs text-muted-foreground">{row.matter.client ?? "No client set"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {row.party_count} parties · {row.doc_count} documents · {row.deadline_count} deadlines
                    </span>
                  </button>
                </li>
              ))}
              {matters.length === 0 && <p className="py-3 text-sm text-muted-foreground">No matters returned.</p>}
            </ul>
          </div>

          <div className="min-h-[480px] flex-1 border-l pl-6">
            {source === "live" ? (
              <BackendGraph matterId={selectedMatterId} />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                Graph view only available for the live backend.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
