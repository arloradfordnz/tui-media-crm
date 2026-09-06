-- Backfill: put existing shoots on the calendar.
--
-- lib/job-calendar.ts mirrors jobs.shoot_date into an events row, but it only
-- runs on a job WRITE. Without this, every shoot booked before that shipped
-- stays invisible on the calendar until someone happens to re-save its job —
-- which for a delivered or archived job is never.
--
-- Idempotent, and it will not duplicate a shoot already on the calendar.
--
-- The first version of this guard only checked for an existing shoot event
-- LINKED TO THAT JOB, which missed the obvious case: a shoot entered by hand
-- months ago has no job_id, so the backfill happily added a second entry for
-- the same shoot on the same day. It did exactly that once, for Team
-- Bainbridge on 2026-04-29. The guard now also skips any day that already
-- carries a shoot event, linked or not.
--
-- Run once, after migration-free deploy. Safe to run again.

INSERT INTO events (job_id, title, event_type, date, notes)
SELECT
  j.id,
  CASE WHEN c.name IS NOT NULL THEN c.name || ' — ' || j.name ELSE j.name END,
  'shoot',
  j.shoot_date,
  j.shoot_location
FROM jobs j
LEFT JOIN clients c ON c.id = j.client_id
WHERE j.shoot_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.event_type = 'shoot'
      AND (
        e.job_id = j.id
        OR (e.job_id IS NULL AND e.date::date = j.shoot_date::date)
      )
  );
