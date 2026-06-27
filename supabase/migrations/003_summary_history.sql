-- ============================================================================
-- Quinn — Summary history for tracking case evolution over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_summary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  summary jsonb NOT NULL,
  doc_count integer DEFAULT 0,
  generated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_summary_history_case_idx
  ON case_summary_history(case_id);
