-- Add client_category column to clients table.
-- Categories: retainer | marketing | one_off
-- Status retainer/marketing values are migrated to this column, then
-- the status is set to 'active' so the status field stays clean.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_category TEXT;

-- Migrate existing retainer/marketing status values into the new column
UPDATE clients
SET client_category = status
WHERE status IN ('retainer', 'marketing') AND client_category IS NULL;

-- Reset those statuses to 'active'
UPDATE clients SET status = 'active'
WHERE status IN ('retainer', 'marketing');
