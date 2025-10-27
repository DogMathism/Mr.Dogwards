-- init.sql
CREATE TABLE IF NOT EXISTS raw_events (
  id uuid PRIMARY KEY,
  user_id uuid,
  session_id uuid,
  event_type text,
  event_payload jsonb,
  ts timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_windows (
  id uuid PRIMARY KEY,
  user_id uuid,
  window_start timestamptz,
  window_end timestamptz,
  attention_span_index double precision,
  engagement_slope double precision,
  cognitive_switch_rate double precision,
  error_consistency_score double precision,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cognitive_profiles (
  user_id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  last_updated timestamptz,
  long_term_features jsonb,
  version int DEFAULT 1
);
