"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface OverviewData {
  name: string;
  isFirstVisit: boolean;
  previousVisit: string | null;
  summary: string;
}

export function MatterOverview({ matterId }: { matterId: string }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    fetch(`/api/matters/${encodeURIComponent(matterId)}/overview`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
        return body as OverviewData;
      })
      .then((body) => {
        if (active) setData(body);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [matterId]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Could not draft an overview: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-6 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Drafting your overview...
      </div>
    );
  }

  return (
    <div className="quinn-surface rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Welcome back, {data.name}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.isFirstVisit
          ? "This is your first visit to this matter."
          : "Here's what's happened since your last visit."}
      </p>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {data.summary}
      </div>
    </div>
  );
}
