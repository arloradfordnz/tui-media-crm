-- SMS assistant — Phase 1 (proactive deadline nudges) + Phase 2 (two-way replies).
-- sms_messages is the conversation log (both directions) that also doubles as
-- the agent's short-term memory between separate serverless invocations.
-- agent_ticks logs every proactive brain-loop run, including the ones where
-- it decided NOT to text — so we can see its reasoning, not just its output.

CREATE TABLE sms_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body        TEXT NOT NULL,
  twilio_sid  TEXT,
  job_id      UUID REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE INDEX sms_messages_created_at_idx ON sms_messages (created_at DESC);

CREATE TABLE agent_ticks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at      TIMESTAMPTZ DEFAULT NOW(),
  trigger     TEXT NOT NULL CHECK (trigger IN ('tick', 'inbound')),
  reasoning   TEXT,          -- the model's final text explaining its decision
  sms_sent    BOOLEAN DEFAULT false,
  sms_body    TEXT
);

CREATE INDEX agent_ticks_ran_at_idx ON agent_ticks (ran_at DESC);

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ticks  ENABLE ROW LEVEL SECURITY;

-- Same pattern as every other table: authenticated admin can see everything.
-- The cron and Twilio webhook write through the service-role client, which
-- bypasses RLS after verifying the cron secret / Twilio signature itself.
CREATE POLICY "auth_all" ON sms_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON agent_ticks  FOR ALL TO authenticated USING (true) WITH CHECK (true);
