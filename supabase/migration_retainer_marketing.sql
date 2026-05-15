-- Add monthly_retainer column to clients for retainer client tracking
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_retainer NUMERIC DEFAULT NULL;
