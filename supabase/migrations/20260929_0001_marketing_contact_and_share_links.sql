-- marketing contact and share links
--
-- Some clients have one person who approves the cut and a different person who
-- posts it. Sam at Johnson Residential approves, but has no time to forward the
-- file on to whoever runs their marketing, so an approval now emails that
-- person the finished video directly.
--
-- clients.marketing_email is who that is. Empty for every client except the
-- ones that want this — an empty value means nothing extra is sent.
--
-- delivery_files.share_token is what the emailed download link carries. R2
-- presigned URLs die after seven days, which is too short for someone who
-- posts the video a fortnight later, so the link points at /api/share/<token>
-- and that mints a fresh presigned URL on every click. The token only opens
-- that one file, never the client's portal.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS marketing_email TEXT;

ALTER TABLE delivery_files ADD COLUMN IF NOT EXISTS share_token UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS delivery_files_share_token_idx ON delivery_files (share_token);
