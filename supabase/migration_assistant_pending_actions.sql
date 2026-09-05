-- Pending destructive actions, for confirming over Telegram.
--
-- lib/ai-tools.ts refuses any tool in CONFIRM_TOOLS (void/delete invoice,
-- remove payment, delete job/event/document) unless the request carries a
-- fingerprint of that exact call. The dashboard can supply one directly.
-- Telegram cannot: a text message has no approval channel, so without this
-- table those tools are simply refused there forever.
--
-- The flow this supports:
--   1. Tui proposes a destructive action; the executor refuses and returns a
--      fingerprint.
--   2. A row is written here and Tui texts back a four-character code.
--   3. Arlo replies "confirm 31b3".
--   4. The inbound handler looks the code up, and passes the stored
--      fingerprint as an approval for that one call.
--
-- Why a code rather than parsing "yes": step 4 must not depend on the model
-- interpreting intent. An exact literal match on a code that Tui generated is
-- deterministic, and it cannot be triggered by an inbound message that merely
-- contains agreeable-sounding text.
--
-- Why fingerprint AND tool_input: the fingerprint is what the executor checks,
-- and it is bound to the arguments — so a confirmed "delete job A" can never
-- be replayed as "delete job B". tool_input is stored for the audit trail.
--
-- Rows are short-lived on purpose (see expires_at, set by the caller to a few
-- minutes out) so a stale confirmation cannot fire an old deletion, and
-- single-use via consumed_at.

CREATE TABLE IF NOT EXISTS assistant_pending_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Full fingerprint from toolFingerprint(name, input).
  fingerprint  TEXT NOT NULL,
  -- Short code quoted to Arlo. Not unique over all time — only over the
  -- live, unconsumed window, which the lookup enforces by ordering on
  -- created_at and filtering on expires_at.
  code         TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  tool_input   JSONB NOT NULL,
  -- Plain-English description of the act, as it was shown to Arlo.
  description  TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS assistant_pending_actions_lookup_idx
  ON assistant_pending_actions (code, consumed_at, expires_at DESC);

ALTER TABLE assistant_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON assistant_pending_actions;
CREATE POLICY "auth_all" ON assistant_pending_actions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
