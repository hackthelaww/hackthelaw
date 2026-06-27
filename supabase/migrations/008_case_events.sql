-- Case intelligence events — classified changes across the case lifecycle
CREATE TABLE IF NOT EXISTS case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('positive', 'routine', 'anomaly')),
  title text NOT NULL,
  description text DEFAULT '',
  severity text DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  entities_involved jsonb DEFAULT '[]',
  source_documents jsonb DEFAULT '[]',
  resolution text DEFAULT NULL,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events(case_id);
CREATE INDEX IF NOT EXISTS case_events_category_idx ON case_events(case_id, category);
