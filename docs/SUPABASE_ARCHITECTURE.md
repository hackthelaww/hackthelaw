# Supabase Integration — Architecture Guide

## Overview

Quinn is a "second brain" for lawyers. It has two data layers:

- **Neo4j** — the knowledge graph. Stores extracted entities, relationships, document content, and provenance from AI analysis.
- **Supabase (PostgreSQL)** — the operational layer. Stores users, case ownership, document metadata, team access, and audit trails.

The link between them is `case_id`: a UUID that exists as a row in Supabase and as a `Matter` node ID in Neo4j.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   FastAPI    │────▶│    Neo4j     │
│  (Next.js)   │     │   Backend    │     │ Knowledge    │
│              │     │              │────▶│   Graph      │
│              │     │              │     └──────────────┘
│              │────▶│              │────▶┌──────────────┐
│              │     │              │     │  Supabase    │
└──────────────┘     └──────────────┘     │  PostgreSQL  │
                                          │  Auth        │
                                          │  Storage     │
                                          └──────────────┘
```

---

## Supabase responsibilities

| Concern | Supabase feature | Why not Neo4j |
|---------|-----------------|---------------|
| Authentication | Supabase Auth (email, OAuth) | Neo4j has no auth layer |
| User profiles | PostgreSQL `users` table | Relational data, not graph |
| Case ownership & permissions | PostgreSQL + RLS | Row-level security is built-in |
| Document file storage | Supabase Storage (S3-compatible) | Neo4j stores text, not files |
| Document metadata | PostgreSQL `case_documents` table | Need to track uploads, not content |
| Audit trail | PostgreSQL `audit_log` table | Append-only log, relational pattern |
| Team management | PostgreSQL `case_members` table | Simple RBAC, not graph traversal |

## Neo4j responsibilities

| Concern | Why Neo4j |
|---------|-----------|
| Extracted entities (people, dates, clauses, obligations) | Dynamic schema, AI-created types |
| Relationships between entities | Graph traversal is the core value |
| Cross-case connections (shared parties, precedents) | Multi-hop queries across cases |
| Document text content + versions | Provenance tracking with Episodes |
| Vector search over chunks (future) | Native vector index |

---

## Database schema (Supabase PostgreSQL)

### `users`

Extends Supabase Auth. No custom table needed initially — use `auth.users` directly.

### `cases`

The central table. Each row corresponds to a `Matter` node in Neo4j.

```sql
create table cases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  client text,
  case_type text default '',           -- e.g. 'litigation', 'contract', 'advisory'
  status text default 'open'           -- 'open', 'in_review', 'closed'
    check (status in ('open', 'in_review', 'closed')),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  neo4j_matter_id text unique          -- the Matter node ID in Neo4j (same as id::text by default)
);

-- Index for listing cases by owner
create index cases_owner_idx on cases(owner_id);
```

### `case_members`

Who can access which case. Enables team collaboration.

```sql
create table case_members (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),

  unique(case_id, user_id)
);

create index case_members_user_idx on case_members(user_id);
create index case_members_case_idx on case_members(case_id);
```

### `case_documents`

Tracks every uploaded document. The actual file lives in Supabase Storage; the extracted text/entities live in Neo4j.

```sql
create table case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  filename text not null,
  title text default '',                -- AI-generated or user-provided
  doc_type text default '',             -- 'contract', 'petition', 'notes', 'recording', etc.
  source text not null default 'upload'
    check (source in ('human', 'ai', 'ocr', 'upload')),
  author text,                          -- required if source = 'human'
  ai_model text,                        -- required if source = 'ai'
  storage_path text,                    -- path in Supabase Storage bucket
  content_hash text,                    -- SHA-256 for dedup
  char_count integer,
  extraction_status text default 'pending'
    check (extraction_status in ('pending', 'processing', 'done', 'failed')),
  extracted_entity_count integer default 0,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz default now(),

  -- Neo4j references
  neo4j_document_id text,              -- Document node ID in Neo4j
  neo4j_episode_id text                -- Episode node ID for provenance
);

create index case_documents_case_idx on case_documents(case_id);
create index case_documents_hash_idx on case_documents(content_hash);
```

### `audit_log`

Append-only log of important actions.

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,                 -- 'case_created', 'document_uploaded', 'extraction_started', etc.
  details jsonb default '{}',
  created_at timestamptz default now()
);

create index audit_log_case_idx on audit_log(case_id);
create index audit_log_user_idx on audit_log(user_id);
```

---

## Row-Level Security (RLS)

Enable RLS on all tables. Lawyers should only see cases they own or are members of.

```sql
-- Enable RLS
alter table cases enable row level security;
alter table case_members enable row level security;
alter table case_documents enable row level security;
alter table audit_log enable row level security;

-- Cases: see only your own cases or cases you're a member of
create policy "Users see own cases" on cases
  for select using (
    owner_id = auth.uid()
    or id in (select case_id from case_members where user_id = auth.uid())
  );

create policy "Users create own cases" on cases
  for insert with check (owner_id = auth.uid());

create policy "Owners update cases" on cases
  for update using (owner_id = auth.uid());

-- Case members: see members of cases you have access to
create policy "Members see co-members" on case_members
  for select using (
    case_id in (select case_id from case_members where user_id = auth.uid())
    or case_id in (select id from cases where owner_id = auth.uid())
  );

-- Only owners can add members
create policy "Owners add members" on case_members
  for insert with check (
    case_id in (select id from cases where owner_id = auth.uid())
  );

-- Documents: see documents for cases you have access to
create policy "Members see documents" on case_documents
  for select using (
    case_id in (select case_id from case_members where user_id = auth.uid())
    or case_id in (select id from cases where owner_id = auth.uid())
  );

create policy "Members upload documents" on case_documents
  for insert with check (
    case_id in (
      select case_id from case_members where user_id = auth.uid() and role in ('owner', 'editor')
    )
    or case_id in (select id from cases where owner_id = auth.uid())
  );

-- Audit log: see logs for your cases
create policy "Members see audit logs" on audit_log
  for select using (
    case_id in (select case_id from case_members where user_id = auth.uid())
    or case_id in (select id from cases where owner_id = auth.uid())
  );
```

---

## Supabase Storage

Create a **private** bucket called `case-documents`.

```
Bucket: case-documents (private)
Path pattern: {case_id}/{document_id}/{filename}
```

Storage policies should mirror the RLS — only case members can read/upload files.

---

## How the backend uses both databases

### Creating a case

```
1. Frontend → POST /api/cases {name, client, type}
2. FastAPI → Supabase: INSERT into cases (returns case_id)
3. FastAPI → Neo4j: CREATE (m:Matter {id: case_id, name: ...})
4. FastAPI → Supabase: INSERT into audit_log
5. Return case_id to frontend
```

### Uploading a document

```
1. Frontend → POST /api/documents/upload {file, case_id}
2. FastAPI → Supabase Storage: upload file to case-documents/{case_id}/...
3. FastAPI → extract text from file (PyMuPDF / plain read)
4. FastAPI → Supabase: INSERT into case_documents (status: 'pending')
5. Return upload preview to frontend
```

### Confirming + extracting a document

```
1. Frontend → POST /api/documents/confirm {upload_id, source}
2. FastAPI → Neo4j: CREATE Document + Version nodes
3. FastAPI → Supabase: UPDATE case_documents SET extraction_status = 'processing'
4. FastAPI → Strands Agent: extract entities + relations into Neo4j
5. FastAPI → Neo4j: Agent creates Entity nodes via tools
6. FastAPI → Supabase: UPDATE case_documents SET extraction_status = 'done',
                        extracted_entity_count = N
7. Return results to frontend
```

### Listing cases (with access control)

```
1. Frontend → GET /api/cases (with auth token)
2. FastAPI → Supabase: SELECT from cases (RLS filters automatically)
3. Return only cases the user owns or is a member of
```

---

## Environment variables

Add to `.env.development`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SECRET_KEY=eyJ...         # server-side only, never expose to frontend
```

FastAPI backend config (`backend/app/config.py`) needs:

```python
supabase_url: str = ""
supabase_publishable_key: str = ""
supabase_secret_key: str = ""
```

Python package: `pip install supabase`

---

## Implementation priority

1. **Create Supabase project** + run the SQL schema above
2. **Add `cases` CRUD** in FastAPI using Supabase client
3. **Move document metadata** tracking to Supabase (keep content in Neo4j)
4. **Add auth** — Supabase Auth + JWT validation in FastAPI middleware
5. **Add file storage** — upload PDFs to Supabase Storage instead of temp files
6. **Add team access** — case_members + RLS

Steps 1–3 are the hackathon priority. Steps 4–6 are polish.

---

## Key principle

**Supabase answers "who can see what." Neo4j answers "what does it mean."**

Never query Neo4j for access control. Never query Supabase for entity relationships.
The `case_id` UUID is the bridge between both worlds.
