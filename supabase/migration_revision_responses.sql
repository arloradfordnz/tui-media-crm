-- Studio responses to client revision requests.
-- Adds a reply message and a responded-at stamp; status gains
-- 'accepted' / 'declined' alongside the existing 'pending' / 'done'.

ALTER TABLE revisions ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE revisions ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Editable templates for the response emails (defaults also live in lib/email.ts).
INSERT INTO email_templates (type, subject, body) VALUES
  ('revision_accepted', 'Your revisions are underway — {{jobName}}', E'Good news — your revision request (round {{round}}) for {{jobName}} has been accepted and we''re onto it now.\n\nWe''ll send through the updated version as soon as it''s ready.'),
  ('revision_declined', 'About your revision request — {{jobName}}', E'We''ve had a look at your revision request (round {{round}}) for {{jobName}} and unfortunately we won''t be able to make these changes as part of this round.\n\nIf you''d like to talk it through, just get in touch and we''ll sort something out.'),
  ('revision_reply', 'A note about your revisions — {{jobName}}', E'We''ve left a note on your revision request (round {{round}}) for {{jobName}} — see below.')
ON CONFLICT (type) DO NOTHING;
