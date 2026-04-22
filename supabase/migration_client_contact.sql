-- Add key contact person to clients (the `name` column is the business / client name)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person TEXT;
