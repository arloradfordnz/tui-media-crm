-- agent_ticks.trigger: allow 'event'
--
-- The proactive assistant used to run on a timer: seven brain-tick crons a
-- day, each one re-reading the whole CRM to work out whether anything had
-- changed. Most of them found nothing, because most of the day nothing
-- happens — and the times something DID happen (a client requesting changes,
-- a proposal being accepted) it waited up to four hours to be noticed.
--
-- Those events are now pushed rather than polled: the server action that
-- handles the client's click emits an assistant event, which runs one turn
-- immediately. See lib/tui/events.ts.
--
-- This is the same class of silent failure as migration_agent_ticks_heartbeat:
-- without widening the CHECK, every event turn's audit row is rejected and
-- the assistant cannot see its own history.
--
-- Safe to run more than once.

ALTER TABLE agent_ticks DROP CONSTRAINT IF EXISTS agent_ticks_trigger_check;

ALTER TABLE agent_ticks
  ADD CONSTRAINT agent_ticks_trigger_check
  CHECK (trigger IN ('tick', 'inbound', 'heartbeat', 'event'));
