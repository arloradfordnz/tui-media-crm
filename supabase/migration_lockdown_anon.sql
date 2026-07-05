-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY LOCKDOWN: remove all anon (public) access to CRM data.
--
-- Background: the anon key ships in the browser bundle, so every "anon" RLS
-- policy below was effectively public on the internet. The old policies let
-- anyone read all clients/jobs/documents/proposals and even UPDATE jobs and
-- delivery_files. The public portal and proposal pages no longer rely on the
-- anon role at all — they now run server-side with the service-role key AFTER
-- verifying the portal/proposal token in the URL (see lib/supabase-admin.ts).
--
-- The service_role key bypasses RLS entirely, so once these policies are gone
-- the portal keeps working while the public loses all direct table access.
--
-- Safe to run more than once (IF EXISTS guards).
-- ─────────────────────────────────────────────────────────────────────────────

-- Reads
DROP POLICY IF EXISTS "anon_read" ON jobs;
DROP POLICY IF EXISTS "anon_read" ON deliverables;
DROP POLICY IF EXISTS "anon_read" ON delivery_files;
DROP POLICY IF EXISTS "anon_read" ON proposals;
DROP POLICY IF EXISTS "anon_read" ON revisions;
DROP POLICY IF EXISTS "anon_read" ON clients;
DROP POLICY IF EXISTS "anon_read" ON documents;

-- Writes
DROP POLICY IF EXISTS "anon_update_delivery" ON delivery_files;
DROP POLICY IF EXISTS "anon_update_jobs"     ON jobs;
DROP POLICY IF EXISTS "anon_insert"          ON revisions;
DROP POLICY IF EXISTS "anon_insert"          ON activities;
DROP POLICY IF EXISTS "anon_insert"          ON notifications;

-- Email tables (migration_email_templates.sql / migration_email_logs.sql).
-- Template reads and log inserts now go through the service-role client.
DROP POLICY IF EXISTS "Anon users can read email templates" ON email_templates;
DROP POLICY IF EXISTS "Anon users can insert email logs"    ON email_logs;

-- Sanity check: list any remaining policies granted to the anon role.
-- Expect ZERO rows after this migration.
--   SELECT schemaname, tablename, policyname, roles
--   FROM pg_policies
--   WHERE 'anon' = ANY (roles);
