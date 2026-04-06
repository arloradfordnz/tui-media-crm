-- ── Tui Media CRM — Database Schema ─────────────────────────────────────────
-- Run this in the Supabase SQL editor to create all tables.
-- Auth is handled by Supabase Auth (auth.users) — no separate users table needed.

-- ── Clients ──────────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  location        TEXT,
  lead_source     TEXT,
  first_contact   TIMESTAMPTZ,
  pipeline_stage  TEXT DEFAULT 'enquiry',
  status          TEXT DEFAULT 'lead',
  lifetime_value  NUMERIC DEFAULT 0,
  notes           TEXT,
  tags            TEXT  -- stored as JSON array string e.g. '["Wedding","Referral"]'
);

-- ── Job Templates ─────────────────────────────────────────────────────────────
CREATE TABLE job_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  job_type    TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL
);

CREATE TABLE template_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES job_templates(id) ON DELETE CASCADE,
  phase       TEXT NOT NULL,
  title       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE template_deliverables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES job_templates(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0
);

-- ── Jobs ─────────────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  job_type        TEXT,
  status          TEXT DEFAULT 'enquiry',
  shoot_date      TIMESTAMPTZ,
  shoot_location  TEXT,
  quote_value     NUMERIC,
  revision_limit  INTEGER DEFAULT 2,
  revisions_used  INTEGER DEFAULT 0,
  notes           TEXT,
  portal_token    TEXT UNIQUE DEFAULT gen_random_uuid()::text
);

-- ── Job Tasks ─────────────────────────────────────────────────────────────────
CREATE TABLE job_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
  phase       TEXT NOT NULL,
  title       TEXT NOT NULL,
  completed   BOOLEAN DEFAULT false,
  due_date    TIMESTAMPTZ,
  sort_order  INTEGER DEFAULT 0
);

-- ── Deliverables ─────────────────────────────────────────────────────────────
CREATE TABLE deliverables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  completed   BOOLEAN DEFAULT false
);

-- ── Delivery Files ────────────────────────────────────────────────────────────
CREATE TABLE delivery_files (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  deliverable_id   UUID REFERENCES deliverables(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  original_name    TEXT NOT NULL,
  file_url         TEXT,
  size             INTEGER DEFAULT 0,
  mime_type        TEXT DEFAULT '',
  version_label    TEXT DEFAULT 'first_cut',
  personal_note    TEXT,
  download_enabled BOOLEAN DEFAULT true,
  link_expiry      TIMESTAMPTZ,
  password_hash    TEXT,
  delivery_status  TEXT DEFAULT 'not_sent',
  viewed_at        TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ
);

-- ── Proposals ─────────────────────────────────────────────────────────────────
CREATE TABLE proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  job_id        UUID REFERENCES jobs(id) ON DELETE CASCADE,
  token         TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  status        TEXT DEFAULT 'draft',
  cover_note    TEXT,
  services      TEXT DEFAULT '[]',
  inclusions    TEXT,
  payment_terms TEXT DEFAULT '50% deposit to secure your date. Remaining 50% due 7 days before the shoot.',
  total_value   NUMERIC DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  responded_at  TIMESTAMPTZ
);

-- ── Revisions ─────────────────────────────────────────────────────────────────
CREATE TABLE revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
  round       INTEGER NOT NULL,
  request     TEXT NOT NULL,
  status      TEXT DEFAULT 'pending'
);

-- ── Legacy Files (client uploads) ─────────────────────────────────────────────
CREATE TABLE files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size          INTEGER NOT NULL,
  mime_type     TEXT NOT NULL,
  description   TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Calendar Events ───────────────────────────────────────────────────────────
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  job_id      UUID REFERENCES jobs(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  date        TIMESTAMPTZ NOT NULL,
  start_time  TEXT,
  end_time    TEXT,
  notes       TEXT
);

-- ── Gear & Equipment ─────────────────────────────────────────────────────────
CREATE TABLE gear (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  name            TEXT NOT NULL,
  category        TEXT,
  purchase_value  NUMERIC,
  insurance_value NUMERIC,
  serial_number   TEXT,
  status          TEXT DEFAULT 'available',
  notes           TEXT
);

-- ── Documents & Templates ─────────────────────────────────────────────────────
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  name        TEXT NOT NULL,
  doc_type    TEXT NOT NULL,
  content     TEXT DEFAULT ''
);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL,
  read        BOOLEAN DEFAULT false,
  link_url    TEXT,
  job_id      UUID,
  client_id   UUID
);

-- ── Activity Log ─────────────────────────────────────────────────────────────
CREATE TABLE activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  action      TEXT NOT NULL,
  details     TEXT,
  job_id      UUID REFERENCES jobs(id) ON DELETE SET NULL,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL
);

-- ── updated_at triggers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at   BEFORE UPDATE ON clients   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER jobs_updated_at      BEFORE UPDATE ON jobs      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER proposals_updated_at BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS on all tables and allow authenticated users full access.
-- Public portal/proposal pages use the anon key — those tables need anon read.

ALTER TABLE clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_files    ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE files             ENABLE ROW LEVEL SECURITY;
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear              ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities        ENABLE ROW LEVEL SECURITY;

-- Authenticated users (admins) can do everything
CREATE POLICY "auth_all" ON clients           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON job_templates     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON template_tasks    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON template_deliverables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON jobs              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON job_tasks         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON deliverables      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON delivery_files    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON proposals         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON revisions         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON files             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON events            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON gear              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON documents         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON notifications     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON activities        FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon users can read jobs/deliverables/delivery_files/proposals/revisions/clients
-- (needed for the public portal and proposal pages which use the anon key)
CREATE POLICY "anon_read" ON jobs            FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON deliverables    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON delivery_files  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON proposals       FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON revisions       FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON clients         FOR SELECT TO anon USING (true);

-- Anon can update delivery_files and jobs (for approve/request changes from portal)
CREATE POLICY "anon_update_delivery" ON delivery_files FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_jobs"     ON jobs           FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_insert"          ON revisions      FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert"          ON activities     FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert"          ON notifications  FOR INSERT TO anon WITH CHECK (true);
