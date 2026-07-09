-- Stable per-client link to one or more Xero contacts. Name/email matching
-- (used by the lifetime-value sync) breaks on spelling drift (e.g. "Pete's
-- Natural" vs "Petes Natural") and can't handle a client that invoices
-- under a second trading name (e.g. Tasman Bay Blues billing as "Lawnrite
-- Stoke"). Once a client is linked here, syncs are exact and survive
-- renames or extra trading names on either side.
--
-- An array, not a single ID, because one CRM client can legitimately map to
-- more than one Xero contact (multiple trading names / businesses).

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
