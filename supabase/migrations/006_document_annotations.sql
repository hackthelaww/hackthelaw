-- Add annotations column for AI-generated document review notes
ALTER TABLE case_documents
  ADD COLUMN IF NOT EXISTS annotations jsonb DEFAULT NULL;
