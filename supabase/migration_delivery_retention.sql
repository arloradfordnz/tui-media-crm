-- Storage retention for client deliveries.
--
-- Cloudflare R2's free tier stops at 10 GB, and a single 4K interview is a
-- quarter of a gigabyte, so the bucket fills in months rather than years.
-- /api/storage/retention deletes the R2 object once a delivery is old enough
-- and stamps archived_at here. The row stays — the client keeps the history of
-- what was delivered and when, they just can't stream or re-download the file.
ALTER TABLE delivery_files ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- The retention sweep scans by age with archived_at still null.
CREATE INDEX IF NOT EXISTS delivery_files_retention_idx
  ON delivery_files (created_at)
  WHERE archived_at IS NULL;
