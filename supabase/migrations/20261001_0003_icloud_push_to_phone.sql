-- icloud push to phone
--
-- The other half of the iPhone calendar sync: CRM events (shoots mirrored from
-- jobs, anything added on the calendar page or by Tui) are written INTO the
-- iCloud work calendar over CalDAV, so the phone needs only one calendar.
--
-- integration_secrets holds the Apple ID and its app-specific password. It has
-- RLS on and NO policies, so only the service role can read it — unlike
-- app_settings, which any signed-in session can select. Nothing in the UI ever
-- reads the password back.
--
-- icloud_push remembers what was written to the phone for each event: where it
-- lives (href) and a hash of what was sent. That is what lets the sync tell a
-- changed event from an unchanged one, and notice an event that has since been
-- deleted from the CRM so it can be removed from the phone as well. event_id
-- deliberately has no foreign key: by the time a deletion is noticed the event
-- row is already gone.

CREATE TABLE IF NOT EXISTS integration_secrets (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE integration_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS icloud_push (
  event_id  UUID PRIMARY KEY,
  href      TEXT NOT NULL,
  hash      TEXT NOT NULL,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE icloud_push ENABLE ROW LEVEL SECURITY;
