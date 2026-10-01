-- iphone calendar sync
--
-- Events from Arlo's iCloud "work" calendar are mirrored into `events`, so the
-- CRM calendar, Today and Tui see them alongside shoots. The iCloud calendar
-- is shared as a public link (Settings → iPhone calendar) and read from there.
--
-- source = 'icloud' marks a mirrored row. The sync owns those rows outright:
-- it rewrites them from the phone every time, so they are never edited here,
-- and the CRM's own feed.ics leaves them out so they do not loop back onto
-- the phone as duplicates.
--
-- external_id is the iCloud UID plus the instance start, one row per
-- occurrence of a recurring event.

ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS events_external_id_idx ON events (external_id) WHERE external_id IS NOT NULL;
