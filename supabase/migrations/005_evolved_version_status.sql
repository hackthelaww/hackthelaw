-- Add 'evolved_version' as a valid similarity_status
-- (detected by LLM semantic comparison, not just text similarity)

ALTER TABLE case_documents
  DROP CONSTRAINT IF EXISTS case_documents_similarity_status_check;

ALTER TABLE case_documents
  ADD CONSTRAINT case_documents_similarity_status_check
  CHECK (similarity_status IN ('exact_duplicate', 'near_duplicate', 'similar', 'new', 'evolved_version'));

-- Add semantic comparison metadata
ALTER TABLE case_documents
  ADD COLUMN IF NOT EXISTS semantic_explanation text DEFAULT '',
  ADD COLUMN IF NOT EXISTS semantic_key_changes jsonb DEFAULT '[]'::jsonb;
