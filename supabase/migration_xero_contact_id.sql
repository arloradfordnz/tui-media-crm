-- Stable per-client link to a Xero contact. Name/email matching (used by the
-- lifetime-value sync) breaks on spelling drift (e.g. "Pete's Natural" vs
-- "Petes Natural"); once a client is linked by ID here, syncs are exact and
-- survive renames on either side.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS xero_contact_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS clients_xero_contact_id_idx
  ON clients(xero_contact_id) WHERE xero_contact_id IS NOT NULL;

-- Two clients whose Xero contact has a different name AND a different email
-- address, so neither the name nor email matcher in lib/lifetime-value.ts
-- can find them automatically. Pinned here by ID (2026-07-09 invoice
-- reconciliation) so the next "Sync Value" click picks them up correctly.
UPDATE clients SET xero_contact_id = 'c724a200-fda1-438f-87ff-19fa1f14003c'
  WHERE name = 'Ngati Koata' AND xero_contact_id IS NULL;   -- Xero: "Ngāti Koata Trust"
UPDATE clients SET xero_contact_id = 'aa0d8830-47b8-4111-9332-06bcb5a65b05'
  WHERE name = 'Future Food Systems' AND xero_contact_id IS NULL;  -- Xero: "Titan Slicer Limited", same @futurefoodsystems.com domain
