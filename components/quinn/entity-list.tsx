"use client";

import { useEffect, useState, useMemo } from "react";
import { getEntities, type EntityItem } from "@/lib/backend";
import { UploadDocumentButton } from "@/components/quinn/upload-document";

const TYPE_COLORS: Record<string, string> = {
  Person: "bg-foreground/10",
  Organization: "bg-foreground/15",
  LawFirm: "bg-foreground/20",
  Court: "bg-foreground/20",
  Judge: "bg-foreground/15",
  Document: "bg-foreground/8",
  Clause: "bg-foreground/8",
  Section: "bg-foreground/8",
  Deadline: "bg-foreground/25",
  Date: "bg-foreground/10",
  TimeConstraint: "bg-foreground/25",
  MonetaryAmount: "bg-foreground/15",
  PaymentObligation: "bg-foreground/15",
  Obligation: "bg-foreground/12",
  Right: "bg-foreground/10",
  Restriction: "bg-foreground/20",
  Jurisdiction: "bg-foreground/12",
  GoverningLaw: "bg-foreground/12",
  RiskFactor: "bg-foreground/25",
  Liability: "bg-foreground/25",
  Definition: "bg-foreground/8",
  Statute: "bg-foreground/12",
  Observation: "bg-foreground/10",
  Institution: "bg-foreground/15",
  LegalConcept: "bg-foreground/12",
};

function getMonogramBg(type: string): string {
  return TYPE_COLORS[type] ?? "bg-foreground/10";
}

export function EntityList({ matterId }: { matterId: string }) {
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityItem | null>(null);

  useEffect(() => {
    setLoading(true);
    getEntities(matterId)
      .then((data) => {
        setEntities(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [matterId]);

  const typeGroups = useMemo(() => {
    const groups: Record<string, EntityItem[]> = {};
    for (const e of entities) {
      const t = e.type ?? "Unknown";
      (groups[t] ??= []).push(e);
    }
    return Object.entries(groups).sort(([, a], [, b]) => b.length - a.length);
  }, [entities]);

  const filtered = selectedType
    ? entities.filter((e) => e.type === selectedType)
    : entities;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading entities...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-sm text-muted-foreground">
        <p>No entities extracted yet. Upload a document to get started.</p>
        <UploadDocumentButton matterId={matterId} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Type filter bar ── */}
      <div className="flex items-center gap-4 border-b pb-4">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Filter
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedType(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              !selectedType
                ? "bg-foreground text-background"
                : "border hover:bg-muted"
            }`}
          >
            All
            <span className="ml-1 tabular-nums opacity-60">{entities.length}</span>
          </button>
          {typeGroups.map(([type, items]) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedType === type
                  ? "bg-foreground text-background"
                  : "border hover:bg-muted"
              }`}
            >
              {type}
              <span className="ml-1 tabular-nums opacity-60">{items.length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Entity card grid ── */}
        <div className="min-w-0 flex-1">
          <div className="animate-stagger grid grid-cols-2 gap-2 xl:grid-cols-3">
            {filtered.map((entity) => (
              <button
                key={entity.id}
                onClick={() => setSelectedEntity(entity)}
                className={`group rounded-lg border p-4 text-left transition-all ${
                  selectedEntity?.id === entity.id
                    ? "border-foreground/30 bg-muted/60 shadow-sm"
                    : "hover:border-foreground/15 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`monogram size-9 text-[11px] text-foreground ${getMonogramBg(entity.type)}`}
                  >
                    {entity.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {entity.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {entity.type}
                    </div>
                  </div>
                </div>
                {entity.description && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {entity.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail panel ── */}
        <div className="hidden w-80 shrink-0 lg:block">
          {selectedEntity ? (
            <div className="sticky top-4 space-y-5 rounded-lg border p-5">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div
                  className={`monogram size-11 text-sm text-foreground ${getMonogramBg(selectedEntity.type)}`}
                >
                  {selectedEntity.name[0]}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {selectedEntity.name}
                  </h3>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {selectedEntity.type}
                  </p>
                </div>
              </div>

              {selectedEntity.description && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Description
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    {selectedEntity.description}
                  </p>
                </div>
              )}

              {selectedEntity.text && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Source text
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
                    {selectedEntity.text}
                  </p>
                </div>
              )}

              {/* Properties */}
              {Object.entries(selectedEntity.properties).filter(
                ([k]) =>
                  !["id", "name", "entity_type", "matter_id", "document_id", "extracted_at", "description", "text"].includes(k)
              ).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Properties
                  </p>
                  <dl className="mt-1.5 space-y-1.5">
                    {Object.entries(selectedEntity.properties)
                      .filter(
                        ([k]) =>
                          !["id", "name", "entity_type", "matter_id", "document_id", "extracted_at", "description", "text"].includes(k)
                      )
                      .map(([key, value]) => (
                        <div key={key} className="flex gap-2 text-sm">
                          <dt className="shrink-0 font-mono text-xs text-muted-foreground">
                            {key}
                          </dt>
                          <dd className="min-w-0 break-words text-foreground">
                            {String(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-20 text-sm text-muted-foreground">
              Select an entity to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
