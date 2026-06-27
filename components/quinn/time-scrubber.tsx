"use client";

import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { History, Radio } from "lucide-react";

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
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {live ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Radio className="size-3 animate-pulse" />
              Live — current beliefs
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <History className="size-3.5" />
              Viewing as of
              <span className="font-mono font-medium text-foreground">{formatDateTime(t)}</span>
            </span>
          )}
        </div>
        {!live && (
          <Button size="sm" variant="outline" onClick={() => setT(maxT)} className="h-7 text-xs">
            Back to live
          </Button>
        )}
      </div>

      <div className="timeline-track px-1">
        <Slider
          min={minT}
          max={maxT}
          step={Math.max(1, Math.round((maxT - minT) / 200))}
          value={[t]}
          onValueChange={(value) => setT(Array.isArray(value) ? value[0] : value)}
        />
      </div>

      <div className="mt-1.5 flex justify-between px-1 font-mono text-[10px] tabular-nums text-muted-foreground/60">
        <span>{formatDateTime(minT)}</span>
        <span>{formatDateTime(maxT)}</span>
      </div>
    </div>
  );
}
