-- ── Time Tracking ────────────────────────────────────────────────────────────
-- Per-job time entries with live timer support and billable calculations.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS time_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  job_id            UUID REFERENCES jobs(id) ON DELETE CASCADE,
  description       TEXT,
  category          TEXT DEFAULT 'general',   -- general, shoot, edit, admin, travel, meeting
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,              -- null = running
  duration_seconds  INTEGER,                  -- set on stop / manual add
  billable          BOOLEAN DEFAULT true,
  hourly_rate       NUMERIC                   -- snapshot of rate at entry time; null falls back to job rate
);

CREATE INDEX IF NOT EXISTS idx_time_entries_job ON time_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_running ON time_entries(job_id) WHERE ended_at IS NULL;

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON time_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
