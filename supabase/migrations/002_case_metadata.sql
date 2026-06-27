-- ============================================================================
-- Quinn — Case metadata expansion + document versioning
-- Run this AFTER 001_initial_schema.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Structured fields on cases
-- ---------------------------------------------------------------------------

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'normal'
    CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS jurisdiction text DEFAULT '',
  ADD COLUMN IF NOT EXISTS judge text DEFAULT '',
  ADD COLUMN IF NOT EXISTS opposing_counsel text DEFAULT '',
  ADD COLUMN IF NOT EXISTS court text DEFAULT '',
  ADD COLUMN IF NOT EXISTS case_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS practice_area text DEFAULT '',
  ADD COLUMN IF NOT EXISTS deadlines jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_summary jsonb DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 2. Document versioning + similarity tracking
-- ---------------------------------------------------------------------------

ALTER TABLE case_documents
  ADD COLUMN IF NOT EXISTS parent_document_id uuid
    REFERENCES case_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS similarity_score real,
  ADD COLUMN IF NOT EXISTS similarity_parent_id uuid
    REFERENCES case_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS similarity_status text DEFAULT NULL
    CHECK (similarity_status IN ('exact_duplicate', 'near_duplicate', 'similar', 'new'));

CREATE INDEX IF NOT EXISTS case_documents_parent_idx
  ON case_documents(parent_document_id);
