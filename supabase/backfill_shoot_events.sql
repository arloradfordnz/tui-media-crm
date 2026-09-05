-- Backfill: put existing shoots on the calendar.
--
-- lib/job-calendar.ts mirrors jobs.shoot_date into an events row, but it only
-- runs on a job WRITE. Without this, every shoot booked before that shipped
-- stays invisible on the calendar until someone happens to re-save its job —
-- which for a delivered or archived job is never.
--
-- Idempotent: the NOT EXISTS guard means running it twice adds nothing, and it
-- never touches a shoot event that already exists (including one created by
-- hand), so it cannot overwrite a start time someone set on the calendar.
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
    WHERE e.job_id = j.id AND e.event_type = 'shoot'
  );
