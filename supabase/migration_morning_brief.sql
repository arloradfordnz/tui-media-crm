-- ── Morning Brief upgrades ────────────────────────────────────────────────
-- Adds predicted-income fields to jobs and a reminder-cooldown field to delivery_files,
-- plus broadens default email templates from "video" to "project".

-- Predicted income tracking on jobs.
-- expected_amount falls back to quote_value when null.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expected_amount NUMERIC;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expected_payment_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Cooldown for "client viewed but didn't respond" reminder emails.
ALTER TABLE delivery_files ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

-- Estimated hours field referenced by jobs.ts but never created in schema.sql.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT 0;

-- Broaden user-facing copy: "video" → "project" so it covers video, photo and marketing work.
UPDATE email_templates
   SET subject = 'Your project is ready for review — {{jobName}}',
       body    = E'Your project for {{jobName}} is ready for review. Use the link below to take a look and share your feedback.'
 WHERE type = 'delivery'
   AND subject = 'Your video is ready for review — {{jobName}}';
