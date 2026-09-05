-- agent_ticks.trigger: allow 'heartbeat'
--
-- migration_add_sms.sql created the table with
--   trigger TEXT NOT NULL CHECK (trigger IN ('tick', 'inbound'))
-- but lib/assistant-agent.ts has three triggers: 'tick', 'inbound' and
-- 'heartbeat'. Every daily heartbeat's audit-log insert has therefore been
-- violating the constraint and failing.
--
-- It fails SILENTLY: the insert's { error } is never read, so nothing surfaces.
-- The consequence is not just a missing log row — buildSnapshot() feeds
-- recent_brain_ticks back to the model, so the assistant has never been able
-- to see its own daily check-ins, and cannot tell whether one ran.
--
-- Safe to run more than once.

ALTER TABLE agent_ticks DROP CONSTRAINT IF EXISTS agent_ticks_trigger_check;

ALTER TABLE agent_ticks
  ADD CONSTRAINT agent_ticks_trigger_check
  CHECK (trigger IN ('tick', 'inbound', 'heartbeat'));
