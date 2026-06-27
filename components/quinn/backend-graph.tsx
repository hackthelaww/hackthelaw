"use client";

import { useEffect, useMemo, useState } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { Node as NvlNode, Relationship as NvlRelationship } from "@neo4j-nvl/base";
import { getGraph, type GraphNode } from "@/lib/backend";

export function BackendGraph({ matterId }: { matterId?: string }) {
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: { source: string; target: string; type: string }[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGraph(matterId)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [matterId]);

  const { nodes, rels } = useMemo(() => {
    if (!data) return { nodes: [] as NvlNode[], rels: [] as NvlRelationship[] };
    const nodes: NvlNode[] = data.nodes.map((n) => ({
      id: n.id,
      caption: n.label,
      color: n.color,
      size: n.type === "Matter" ? 32 : 20,
    }));
    const rels: NvlRelationship[] = data.edges.map((e, i) => ({
      id: `${e.source}-${e.type}-${e.target}-${i}`,
      from: e.source,
      to: e.target,
      caption: e.type,
    }));
    return { nodes, rels };
  }, [data]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
        Couldn&apos;t reach the FastAPI backend: {error}
      </div>
    );
  }

  if (!data) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading from :8000…</div>;
  }

  return (
    <div className="relative h-full">
      <InteractiveNvlWrapper
        nodes={nodes}
        rels={rels}
        nvlOptions={{ disableTelemetry: true }}
        mouseEventCallbacks={{
          onNodeClick: (node) => setSelected(data.nodes.find((n) => n.id === node.id) ?? null),
          onCanvasClick: () => setSelected(null),
        }}
        style={{ width: "100%", height: "100%" }}
      />
      {selected && (
        <div className="absolute right-3 top-3 w-64 rounded-md border bg-card p-3 text-xs shadow-md">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{selected.label}</span>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              ×
            </button>
          </div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{selected.type}</p>
          <dl className="space-y-1">
            {Object.entries(selected.properties)
              .filter(([, value]) => value !== null)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{key}</dt>
                  <dd className="break-words text-foreground">{String(value)}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}
