-- ============================================================================
-- Quinn — per-user "last viewed" tracking for matters
-- Run this AFTER 002_case_metadata.sql
--
-- Keyed by the Neo4j matter id (text) directly rather than the Supabase
-- `cases.id` UUID, since not every matter (e.g. the seeded demo matters)
-- has a corresponding `cases` row — this works regardless.
-- ============================================================================

create table if not exists matter_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  matter_id text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, matter_id)
);

alter table matter_visits enable row level security;

create policy "Users manage their own visits" on matter_visits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
