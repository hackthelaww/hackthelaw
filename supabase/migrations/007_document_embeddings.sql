-- Store document embeddings for semantic similarity search
ALTER TABLE case_documents
  ADD COLUMN IF NOT EXISTS embedding jsonb DEFAULT NULL;
