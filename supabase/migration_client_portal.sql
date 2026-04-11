-- ── Client Portal Migration ──────────────────────────────────────────────────
-- Run this in the Supabase SQL editor to add client portal support.

-- 1. Add portal_token to clients (auto-generated UUID for portal links)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE DEFAULT gen_random_uuid()::text;

-- Backfill existing clients that don't have a token
UPDATE clients SET portal_token = gen_random_uuid()::text WHERE portal_token IS NULL;

-- 2. Add client_id to documents (link documents to specific clients)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- 3. Anon read policy for documents (so portal can display them)
CREATE POLICY "anon_read" ON documents FOR SELECT TO anon USING (true);
