"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { Node as NvlNode, Relationship as NvlRelationship } from "@neo4j-nvl/base";
import { colorForNode, graphPalette } from "@/components/quinn/graph-colors";
import { formatDateTime } from "@/lib/format";
import type { GraphNode } from "@/lib/graph/queries";

interface GraphData {
  nodes: GraphNode[];
  edges: { id: string; from: string; to: string; type: string; caption?: string }[];
}

const LABEL_LEGEND: { label: GraphNode["label"]; description: string }[] = [
  { label: "Matter", description: "The matter itself" },
  { label: "Party", description: "Counterparties" },
  { label: "Clause", description: "A clause in the document" },
  { label: "Finding", description: "Current assessment — solid if it needs your judgement" },
  { label: "Provision", description: "Real GDPR article relied on" },
  { label: "PlaybookRule", description: "Firm rule a finding deviates from" },
  { label: "Review", description: "A partner's decision" },
  { label: "SignOff", description: "An approval attestation" },
];

export function MatterGraph({ matterId, viewingAt }: { matterId: string; viewingAt: number }) {
  const { resolvedTheme } = useTheme();
  const palette = graphPalette(resolvedTheme);
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/matters/${matterId}/graph?t=${Math.round(viewingAt)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
        return body as GraphData;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
        setSelected(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setSelected(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matterId, viewingAt]);

  const { nodes, rels } = useMemo(() => {
    if (!data) return { nodes: [] as NvlNode[], rels: [] as NvlRelationship[] };
    const nodes: NvlNode[] = data.nodes.map((n) => ({
      id: n.id,
      caption: n.caption,
      color: colorForNode(palette, n.label, n.label === "Finding" ? (n.properties.status as string) : undefined),
      size: n.label === "Matter" ? 36 : n.label === "Clause" || n.label === "Finding" ? 26 : 18,
    }));
    const rels: NvlRelationship[] = data.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      color: palette.edge,
    }));
    return { nodes, rels };
  }, [data, palette]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
        Couldn&apos;t load the graph: {error}
      </div>
    );
  }

  if (!data) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading graph…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
        <span>as of {formatDateTime(viewingAt)}</span>
      </div>
      <div className="relative flex-1">
        <InteractiveNvlWrapper
          nodes={nodes}
          rels={rels}
          nvlOptions={{ disableTelemetry: true }}
          mouseEventCallbacks={{
            onNodeClick: (node) => {
              const match = data.nodes.find((n) => n.id === node.id) ?? null;
              setSelected(match);
            },
            onCanvasClick: () => setSelected(null),
          }}
          style={{ width: "100%", height: "100%" }}
        />
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-md border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground">
          {LABEL_LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: colorForNode(palette, item.label) }}
              />
              {item.label}
            </span>
          ))}
        </div>
        {selected && (
          <div className="absolute right-3 top-3 w-64 rounded-md border bg-card p-3 text-xs shadow-md">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-heading text-sm text-foreground">{selected.caption}</span>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{selected.label}</p>
            <dl className="space-y-1">
              {Object.entries(selected.properties)
                .filter(([key]) => key !== "id")
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
    </div>
  );
}
