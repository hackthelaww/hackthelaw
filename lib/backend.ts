/**
 * Client for calling the FastAPI backend.
 *
 * In development: calls localhost:8000 directly.
 * In production: should go through a reverse proxy / same origin.
 */

import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // No auth available (e.g. server-side without session)
  }
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BACKEND_URL}${path}`;
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...init?.headers,
    },
    // Don't cache server-side fetches in Next.js
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Matters
// ---------------------------------------------------------------------------

export async function listMatters() {
  return request<
    {
      matter: Record<string, unknown>;
      party_count: number;
      doc_count: number;
      deadline_count: number;
    }[]
  >("/api/matters");
}

export async function getMatter(id: string) {
  return request<{
    matter: Record<string, unknown>;
    parties: Record<string, unknown>[];
    documents: Record<string, unknown>[];
    deadlines: Record<string, unknown>[];
  }>(`/api/matters/${encodeURIComponent(id)}`);
}

export async function createMatter(body: {
  id: string;
  name: string;
  description?: string;
  client?: string;
  tags?: string[];
}) {
  return request("/api/matters", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Graph visualization
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function getGraph(matterId?: string): Promise<GraphData> {
  const path = matterId
    ? `/api/graph/${encodeURIComponent(matterId)}`
    : "/api/graph";
  return request<GraphData>(path);
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface EntityItem {
  id: string;
  name: string;
  type: string;
  description: string | null;
  text: string | null;
  matter_id: string;
  document_id: string | null;
  labels: string[];
  properties: Record<string, unknown>;
}

export async function getEntities(matterId: string): Promise<EntityItem[]> {
  return request<EntityItem[]>(`/api/entities/${encodeURIComponent(matterId)}`);
}

export async function getEntitySummary(matterId: string) {
  return request<{ matter_id: string; total: number; by_type: Record<string, number> }>(
    `/api/entities/${encodeURIComponent(matterId)}/summary`
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineBatch {
  batch_date: string;
  batch_index: number;
  documents: {
    id: string;
    filename: string;
    title: string;
    uploaded_at: string;
    similarity_status: string;
    similarity_score: number | null;
    similarity_parent_filename: string | null;
    version_number: number;
    version_chain: { id: string; filename: string; version_number: number }[];
    entity_count: number;
    extraction_status: string;
    char_count: number;
  }[];
  new_doc_count: number;
  batch_entity_count: number;
  cumulative_entity_count: number;
  cumulative_doc_count: number;
}

export interface TimelineData {
  batches: TimelineBatch[];
  total_documents: number;
  total_entities: number;
  total_duplicates_skipped: number;
  date_range: { first: string | null; last: string | null };
}

export async function getTimeline(slug: string): Promise<TimelineData> {
  return request<TimelineData>(`/api/cases/${encodeURIComponent(slug)}/timeline`);
}

export async function getDocumentDiff(docId: string) {
  return request<{
    original_filename: string;
    new_filename: string;
    similarity_score: number;
    diff_summary: string;
    original_chars: number;
    new_chars: number;
  }>(`/api/documents/${encodeURIComponent(docId)}/diff`);
}
