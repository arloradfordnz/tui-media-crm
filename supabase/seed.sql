-- ── Tui Media CRM — Seed Data ─────────────────────────────────────────────────
-- Run AFTER schema.sql.
-- Admin user: create via Supabase Auth (see README or post-deploy notes).

-- ── Job Templates ─────────────────────────────────────────────────────────────
INSERT INTO job_templates (id, job_type, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'wedding',     'Wedding'),
  ('00000000-0000-0000-0000-000000000002', 'anniversary', 'Anniversary & Couples'),
  ('00000000-0000-0000-0000-000000000003', 'corporate',   'Corporate'),
  ('00000000-0000-0000-0000-000000000004', 'event',       'Event'),
  ('00000000-0000-0000-0000-000000000005', 'realestate',  'Real Estate'),
  ('00000000-0000-0000-0000-000000000006', 'custom',      'Custom');

-- Wedding tasks
INSERT INTO template_tasks (template_id, phase, title, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'preshoot',       'Send client questionnaire',              0),
  ('00000000-0000-0000-0000-000000000001', 'preshoot',       'Confirm venue details & timeline',       1),
  ('00000000-0000-0000-0000-000000000001', 'preshoot',       'Prepare shot list',                      2),
  ('00000000-0000-0000-0000-000000000001', 'preshoot',       'Confirm second shooter (if applicable)', 3),
  ('00000000-0000-0000-0000-000000000001', 'preshoot',       'Charge & prep all gear',                 4),
  ('00000000-0000-0000-0000-000000000001', 'shootday',       'Capture ceremony coverage',              5),
  ('00000000-0000-0000-0000-000000000001', 'shootday',       'Capture reception highlights',           6),
  ('00000000-0000-0000-0000-000000000001', 'shootday',       'Capture speeches & dances',              7),
  ('00000000-0000-0000-0000-000000000001', 'postproduction', 'Import & back up footage',               8),
  ('00000000-0000-0000-0000-000000000001', 'postproduction', 'Rough cut edit',                         9),
  ('00000000-0000-0000-0000-000000000001', 'postproduction', 'Colour grade',                           10),
  ('00000000-0000-0000-0000-000000000001', 'postproduction', 'Music licensing',                        11),
  ('00000000-0000-0000-0000-000000000001', 'postproduction', 'Final export',                           12),
  ('00000000-0000-0000-0000-000000000001', 'delivery',       'Upload to client portal',                13),
  ('00000000-0000-0000-0000-000000000001', 'delivery',       'Send portal link to client',             14),
  ('00000000-0000-0000-0000-000000000001', 'delivery',       'Archive project files',                  15);

INSERT INTO template_deliverables (template_id, title, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Highlight Film',  '3–5 min cinematic highlight', 0),
  ('00000000-0000-0000-0000-000000000001', 'Full Ceremony',   'Unedited ceremony footage',   1),
  ('00000000-0000-0000-0000-000000000001', 'Full Reception',  'Unedited reception footage',  2);

-- Corporate tasks
INSERT INTO template_tasks (template_id, phase, title, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000003', 'preshoot',       'Brief & concept confirmation',    0),
  ('00000000-0000-0000-0000-000000000003', 'preshoot',       'Location scout',                  1),
  ('00000000-0000-0000-0000-000000000003', 'preshoot',       'Script / interview questions',    2),
  ('00000000-0000-0000-0000-000000000003', 'shootday',       'Setup & lighting',                3),
  ('00000000-0000-0000-0000-000000000003', 'shootday',       'Interviews / main coverage',      4),
  ('00000000-0000-0000-0000-000000000003', 'shootday',       'B-roll capture',                  5),
  ('00000000-0000-0000-0000-000000000003', 'postproduction', 'Import & back up footage',        6),
  ('00000000-0000-0000-0000-000000000003', 'postproduction', 'Edit & colour grade',             7),
  ('00000000-0000-0000-0000-000000000003', 'postproduction', 'Graphics & lower thirds',         8),
  ('00000000-0000-0000-0000-000000000003', 'postproduction', 'Final export',                    9),
  ('00000000-0000-0000-0000-000000000003', 'delivery',       'Upload to client portal',         10),
  ('00000000-0000-0000-0000-000000000003', 'delivery',       'Deliver final files',             11);

INSERT INTO template_deliverables (template_id, title, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000003', 'Corporate Video', 'Final branded video', 0);

-- Anniversary tasks
INSERT INTO template_tasks (template_id, phase, title, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000002', 'preshoot',       'Client questionnaire',         0),
  ('00000000-0000-0000-0000-000000000002', 'preshoot',       'Location & styling discussion',1),
  ('00000000-0000-0000-0000-000000000002', 'shootday',       'Location shoot',               2),
  ('00000000-0000-0000-0000-000000000002', 'postproduction', 'Edit & colour grade',          3),
  ('00000000-0000-0000-0000-000000000002', 'postproduction', 'Music licensing',              4),
  ('00000000-0000-0000-0000-000000000002', 'delivery',       'Deliver via client portal',    5);

INSERT INTO template_deliverables (template_id, title, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000002', 'Couples Film', 'Cinematic short film', 0);

-- Event tasks
INSERT INTO template_tasks (template_id, phase, title, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000004', 'preshoot',       'Event brief & run sheet',        0),
  ('00000000-0000-0000-0000-000000000004', 'shootday',       'Event coverage',                 1),
  ('00000000-0000-0000-0000-000000000004', 'postproduction', 'Edit highlights',                2),
  ('00000000-0000-0000-0000-000000000004', 'delivery',       'Deliver via client portal',      3);

INSERT INTO template_deliverables (template_id, title, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000004', 'Event Highlights', '2–3 min highlight reel', 0);

-- Real Estate tasks
INSERT INTO template_tasks (template_id, phase, title, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000005', 'preshoot',       'Property brief',                0),
  ('00000000-0000-0000-0000-000000000005', 'shootday',       'Property walkthrough',          1),
  ('00000000-0000-0000-0000-000000000005', 'shootday',       'Aerial footage',                2),
  ('00000000-0000-0000-0000-000000000005', 'postproduction', 'Edit & colour grade',           3),
  ('00000000-0000-0000-0000-000000000005', 'delivery',       'Deliver via client portal',     4);

INSERT INTO template_deliverables (template_id, title, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000005', 'Property Video', 'Listing video', 0);

-- ── Sample Clients ────────────────────────────────────────────────────────────
INSERT INTO clients (id, name, email, phone, location, lead_source, pipeline_stage, status, lifetime_value, tags) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sarah & James Mitchell', 'sarah.mitchell@example.com', '+64 21 555 0101', 'Auckland, NZ', 'Referral', 'booked', 'active', 4500, '["Wedding","Referral"]'),
  ('10000000-0000-0000-0000-000000000002', 'Meridian Energy',        'events@meridian.co.nz',     '+64 9 555 0202',  'Wellington, NZ', 'Website',  'proposal', 'lead',   0,    '["Corporate"]'),
  ('10000000-0000-0000-0000-000000000003', 'Tom & Lisa Chen',        'tom.chen@example.com',      '+64 21 555 0303', 'Christchurch, NZ', 'Social Media', 'enquiry', 'lead', 0, '["Anniversary"]');

-- ── Sample Jobs ───────────────────────────────────────────────────────────────
INSERT INTO jobs (id, client_id, name, job_type, status, shoot_date, shoot_location, quote_value, revision_limit) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mitchell Wedding — Highlight Film', 'wedding', 'editing', '2026-06-14 10:00:00+12', 'Waterfall Estate, Warkworth', 4500, 2),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Meridian Energy — Brand Video',    'corporate','enquiry', NULL, 'Wellington Office', 3200, 2),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Chen Anniversary Film',            'anniversary','enquiry', '2026-07-20 14:00:00+12', 'Queenstown', 1800, 2);

-- ── Sample Job Tasks (for Mitchell Wedding) ───────────────────────────────────
INSERT INTO job_tasks (job_id, phase, title, completed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000001', 'preshoot', 'Send client questionnaire',    true,  0),
  ('20000000-0000-0000-0000-000000000001', 'preshoot', 'Confirm venue details',        true,  1),
  ('20000000-0000-0000-0000-000000000001', 'preshoot', 'Prepare shot list',            true,  2),
  ('20000000-0000-0000-0000-000000000001', 'preshoot', 'Charge & prep all gear',       true,  3),
  ('20000000-0000-0000-0000-000000000001', 'shootday', 'Capture ceremony coverage',    true,  4),
  ('20000000-0000-0000-0000-000000000001', 'shootday', 'Capture reception highlights', true,  5),
  ('20000000-0000-0000-0000-000000000001', 'postproduction', 'Import & back up footage', true, 6),
  ('20000000-0000-0000-0000-000000000001', 'postproduction', 'Rough cut edit',          true, 7),
  ('20000000-0000-0000-0000-000000000001', 'postproduction', 'Colour grade',            false, 8),
  ('20000000-0000-0000-0000-000000000001', 'postproduction', 'Music licensing',         false, 9),
  ('20000000-0000-0000-0000-000000000001', 'postproduction', 'Final export',            false, 10),
  ('20000000-0000-0000-0000-000000000001', 'delivery', 'Upload to client portal',       false, 11),
  ('20000000-0000-0000-0000-000000000001', 'delivery', 'Send portal link to client',   false, 12);

-- ── Sample Deliverables ────────────────────────────────────────────────────────
INSERT INTO deliverables (job_id, title, description, completed) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Highlight Film', '3–5 min cinematic highlight', false),
  ('20000000-0000-0000-0000-000000000001', 'Full Ceremony',  'Unedited ceremony footage',   false);

-- ── Sample Activities ─────────────────────────────────────────────────────────
INSERT INTO activities (action, details, job_id, client_id) VALUES
  ('job_created', 'Job "Mitchell Wedding — Highlight Film" created', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('status_changed', 'Status changed to editing', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('job_created', 'Job "Meridian Energy — Brand Video" created', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
