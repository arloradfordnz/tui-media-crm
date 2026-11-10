-- supabase/migration_xero_contact_id.sql was never run (found 10 November 2026),
-- so the lifetime-value sync was skipping its pinned Xero contacts and
-- missing Ngati Koata, Future Food Systems and Tasman Bay Blues revenue.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS xero_contact_ids TEXT[] DEFAULT '{}'::text[];

-- Clients whose Xero contact has both a different name AND a different
-- email, so neither the name nor email matcher in lib/lifetime-value.ts can
-- find them automatically. Pinned here (2026-07-09 invoice reconciliation)
-- so the next "Sync Value" click picks them up correctly.
UPDATE clients SET xero_contact_ids = ARRAY['c724a200-fda1-438f-87ff-19fa1f14003c']
  WHERE name = 'Ngati Koata' AND xero_contact_ids = '{}';   -- Xero: "Ngāti Koata Trust"
UPDATE clients SET xero_contact_ids = ARRAY['aa0d8830-47b8-4111-9332-06bcb5a65b05']
  WHERE name = 'Future Food Systems' AND xero_contact_ids = '{}';  -- Xero: "Titan Slicer Limited", same @futurefoodsystems.com domain
UPDATE clients SET xero_contact_ids = ARRAY['633abef8-1ffd-46cf-8db5-6bd0191b2fdc']
  WHERE name = 'Tasman Bay Blues' AND xero_contact_ids = '{}';  -- Xero: "Lawnrite Stoke" — Ben invoices this job under a second business name
