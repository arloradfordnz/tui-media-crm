-- revision responses
--
-- Runs once, automatically, on the next deploy. Write it so it can be read
-- in a year: what changed and why, not just the DDL.


-- Studio responses to client revision requests (accept / decline / reply).
-- supabase/migration_revision_responses.sql was never run against this
-- database, so the columns were missing and responding to a revision failed.
-- Idempotent: safe if they already exist.
ALTER TABLE revisions ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE revisions ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

INSERT INTO email_templates (type, subject, body) VALUES
  ('revision_accepted', 'Your revisions are underway — {{jobName}}', E'Good news — your revision request (round {{round}}) for {{jobName}} has been accepted and we''re onto it now.\n\nWe''ll send through the updated version as soon as it''s ready.'),
  ('revision_declined', 'About your revision request — {{jobName}}', E'We''ve had a look at your revision request (round {{round}}) for {{jobName}} and unfortunately we won''t be able to make these changes as part of this round.\n\nIf you''d like to talk it through, just get in touch and we''ll sort something out.'),
  ('revision_reply', 'A note about your revisions — {{jobName}}', E'We''ve left a note on your revision request (round {{round}}) for {{jobName}} — see below.')
ON CONFLICT (type) DO NOTHING;
