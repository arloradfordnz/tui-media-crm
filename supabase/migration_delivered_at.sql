-- ─────────────────────────────────────────────────────────────────────────────
-- Add jobs.delivered_at — a stable timestamp for when a job was delivered.
--
-- Revenue used to be bucketed by updated_at, so editing any old delivered job
-- (fixing a typo, adding a note) silently moved its revenue into the current
-- month. delivered_at is set once when the status transitions to 'delivered'
-- and never drifts on later edits.
--
-- Backfill: existing delivered/archived jobs get their current updated_at as
-- the best available approximation.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

UPDATE jobs
SET delivered_at = updated_at
WHERE status IN ('delivered', 'archived')
  AND delivered_at IS NULL;
