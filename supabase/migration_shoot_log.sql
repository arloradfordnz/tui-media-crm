-- Shoots belong to a client, not only to a job.
--
-- events.job_id was the only link a shoot had, which meant a shoot could only
-- be attributed to a client if someone had already made the job for it. Two
-- consequences, both real in the live data:
--
--   1. A shoot logged on its own carried no client at all. "ATK Detailing —
--      8 Dollar Reel" on 2026-04-27 has job_id NULL, so nothing could tell you
--      whose shoot it was without reading the title.
--   2. A retainer month job holds ONE shoot_date. Two shoots in a month had
--      nowhere to live, so the second one simply was not recorded.
--
-- With client_id on the event, a shoot can be logged the moment it happens
-- ("did a shoot for Bainbridge today") and still count toward that client's
-- month, whether or not the month job exists yet.
ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Backfill from the job link, which is where every existing shoot got its
-- client from implicitly. Idempotent: only fills rows that have no client yet.
UPDATE events e
SET client_id = j.client_id
FROM jobs j
WHERE e.job_id = j.id
  AND e.client_id IS NULL
  AND j.client_id IS NOT NULL;

-- The shoot count per client per month is the query this exists to serve.
CREATE INDEX IF NOT EXISTS events_client_shoot_idx
  ON events (client_id, event_type, date);
