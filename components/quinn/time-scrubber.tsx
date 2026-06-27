"use client";

import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { History } from "lucide-react";

export interface SnapshotEntry {
  clauseId: string;
  findingId: string;
  status: string;
  summary: string;
  triageScore: number;
  validAt: number;
  createdAt: number;
}

export function TimeScrubber({
  matterId,
  minT,
  maxT,
  onSnapshot,
}: {
  matterId: string;
  minT: number;
  maxT: number;
  onSnapshot: (entries: SnapshotEntry[] | null, viewingAt: number | null) => void;
}) {
  const [t, setT] = useState(maxT);
  const live = t >= maxT;
  const fetchToken = useRef(0);

  useEffect(() => {
    if (live) {
      onSnapshot(null, null);
      return;
    }
    const token = ++fetchToken.current;
    fetch(`/api/matters/${matterId}/snapshot?t=${Math.round(t)}`)
      .then((res) => res.json())
      .then((data) => {
        if (fetchToken.current === token) onSnapshot(data.entries, t);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, live, matterId]);

  if (minT >= maxT) return null;

  return (
    <div className="border-b pb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <History className="size-3.5" />
          {live ? "Live — current beliefs" : `Viewing as of ${formatDateTime(t)}`}
        </div>
        {!live && (
          <Button size="sm" variant="outline" onClick={() => setT(maxT)}>
            Back to live
          </Button>
        )}
      </div>
      <Slider
        min={minT}
        max={maxT}
        step={Math.max(1, Math.round((maxT - minT) / 200))}
        value={[t]}
        onValueChange={(value) => setT(Array.isArray(value) ? value[0] : value)}
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{formatDateTime(minT)}</span>
        <span>{formatDateTime(maxT)}</span>
      </div>
    </div>
  );
}
