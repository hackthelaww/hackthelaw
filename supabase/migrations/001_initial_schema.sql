-- ============================================================================
-- Quinn — Supabase schema (operational layer)
-- Run this in the Supabase SQL Editor or via `supabase db push`
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cases
-- ---------------------------------------------------------------------------

create table cases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  client text,
  case_type text default '',
  status text default 'open'
    check (status in ('open', 'in_review', 'closed')),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  neo4j_matter_id text unique            -- slug ID that matches the Matter node in Neo4j
);

create index cases_owner_idx on cases(owner_id);

-- ---------------------------------------------------------------------------
-- 2. Case members
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 3. Case documents
-- ---------------------------------------------------------------------------

create table case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  filename text not null,
  title text default '',
  doc_type text default '',
  source text not null default 'upload'
    check (source in ('human', 'ai', 'ocr', 'upload')),
  author text,
  ai_model text,
  storage_path text,
  content_hash text,
  char_count integer,
  extraction_status text default 'pending'
    check (extraction_status in ('pending', 'processing', 'done', 'failed')),
  extracted_entity_count integer default 0,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz default now(),

  -- Neo4j cross-references
  neo4j_document_id text,
  neo4j_episode_id text
);

create index case_documents_case_idx on case_documents(case_id);
create index case_documents_hash_idx on case_documents(content_hash);

-- ---------------------------------------------------------------------------
-- 4. Audit log
-- ---------------------------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb default '{}',
  created_at timestamptz default now()
);

create index audit_log_case_idx on audit_log(case_id);
create index audit_log_user_idx on audit_log(user_id);

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security
-- ---------------------------------------------------------------------------

alter table cases enable row level security;
alter table case_members enable row level security;
alter table case_documents enable row level security;
alter table audit_log enable row level security;

-- Cases: see own cases or cases you're a member of
create policy "Users see own cases" on cases
  for select using (
    owner_id = auth.uid()
    or id in (select case_id from case_members where user_id = auth.uid())
  );

create policy "Users create own cases" on cases
  for insert with check (owner_id = auth.uid());

create policy "Owners update cases" on cases
  for update using (owner_id = auth.uid());

-- Case members: see co-members
create policy "Members see co-members" on case_members
  for select using (
    case_id in (select case_id from case_members where user_id = auth.uid())
    or case_id in (select id from cases where owner_id = auth.uid())
  );

create policy "Owners add members" on case_members
  for insert with check (
    case_id in (select id from cases where owner_id = auth.uid())
  );

-- Documents: see docs for your cases
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

-- ---------------------------------------------------------------------------
-- 6. Storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

-- Storage policies: members can read, editors/owners can upload
create policy "Members read case files" on storage.objects
  for select using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1]::uuid in (
      select case_id from case_members where user_id = auth.uid()
      union
      select id from cases where owner_id = auth.uid()
    )
  );

create policy "Editors upload case files" on storage.objects
  for insert with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1]::uuid in (
      select case_id from case_members where user_id = auth.uid() and role in ('owner', 'editor')
      union
      select id from cases where owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Auto-update updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cases_updated_at
  before update on cases
  for each row execute function update_updated_at();
