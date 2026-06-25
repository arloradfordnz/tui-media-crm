-- Add shoots_per_month to clients for retainer scheduling
ALTER TABLE clients ADD COLUMN IF NOT EXISTS shoots_per_month integer;
