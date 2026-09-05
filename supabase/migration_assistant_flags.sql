-- Notification state for the proactive assistant.
--
-- Until now, "don't tell Arlo the same thing twice" was a paragraph in the
-- system prompt: the model was handed the last five brain ticks and the last
-- twelve messages and asked to work out for itself what it had already said.
-- That is not deduplication, it is a request. It fails in both directions —
-- the same stalled job gets flagged three days running because the wording
-- drifted, and a genuinely worsening problem gets swallowed because a vaguely
-- similar sentence appears in the scrollback.
--
-- A flag is one concern with a stable identity: "job 41ac is stalled",
-- "Bainbridge owes three videos for July", "INV-1042 is 31 days overdue".
-- The key is derived from the underlying row, so the same concern seen on
-- Monday and Thursday is one flag with two last_seen_at values, not two
-- separate things to mention.
--
-- What each timestamp is for:
--   first_seen_at    how long this has been true. "Stalled since the 3rd" is
--                    a better sentence than "stalled", and only this column
--                    can produce it.
--   last_seen_at     still true as of the most recent sweep. A flag that
--                    stops appearing is resolved, not forgotten.
--   last_notified_at the actual dedup key. Combined with notify_count it
--                    drives a backoff, so a standing problem is raised again
--                    eventually but not daily.
--   snooze_until     Arlo said "not now". An explicit silence with an end.
--   resolved_at      the underlying condition went away. Kept rather than
--                    deleted so the assistant can say "that's sorted now"
--                    and so the history is auditable.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS assistant_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deterministic identity, e.g. 'stalled_job:41ac…', 'backlog:<client>:2026-07'.
  -- See deriveFlags() in lib/tui/flags.ts, which is the only thing that mints
  -- these. Unique so the sweep can upsert on it.
  key              TEXT NOT NULL UNIQUE,
  -- Coarse family: stalled_job, overdue_task, overdue_invoice, content_backlog,
  -- cold_lead, stale_proposal, dormant_client, missed_deadline, unprepped_shoot.
  kind             TEXT NOT NULL,
  -- One human sentence. This is what Tui reads, not the raw row.
  subject          TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'normal',
  detail           JSONB,

  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  notify_count     INTEGER NOT NULL DEFAULT 0,
  snooze_until     TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,

  CONSTRAINT assistant_flags_severity_check
    CHECK (severity IN ('low', 'normal', 'high'))
);

-- The sweep's read path: unresolved flags, ordered by how long they have been
-- waiting. Partial on resolved_at IS NULL because resolved rows are archive.
CREATE INDEX IF NOT EXISTS assistant_flags_open_idx
  ON assistant_flags (last_notified_at NULLS FIRST, first_seen_at)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS assistant_flags_kind_idx
  ON assistant_flags (kind)
  WHERE resolved_at IS NULL;

ALTER TABLE assistant_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON assistant_flags;
CREATE POLICY "auth_all" ON assistant_flags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
