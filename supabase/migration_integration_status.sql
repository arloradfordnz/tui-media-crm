-- Connectivity, kept warm by a cron instead of probed on the request path.
--
-- buildSnapshot() used to answer "is Xero connected / is mail connected" by
-- calling getValidXeroAccount() and checkMailConnection() inline, on every
-- assistant turn. That is a Xero token refresh and an IMAP login before the
-- model sees a token — on a turn that might be replying to the word "done".
--
-- Both answers are inherently minutes-stale, so they belong in a table that
-- /api/health/integrations refreshes on a schedule. The assistant reads the
-- row and also sees checked_at, so a health cron that has itself stopped
-- shows up as stale rather than as silence.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS integration_status (
  integration TEXT PRIMARY KEY,          -- 'xero' | 'email'
  ok          BOOLEAN NOT NULL,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Short human-readable reason when ok = false. Never a token or a password.
  detail      TEXT
);

ALTER TABLE integration_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON integration_status;
CREATE POLICY "auth_all" ON integration_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
