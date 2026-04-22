-- Per-deliverable revision tracking.
-- Each deliverable can have its own revision limit (default 2).
-- Revision rows can now be tied to a specific deliverable.

ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS revision_limit INTEGER DEFAULT 2;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS revisions_used INTEGER DEFAULT 0;

ALTER TABLE revisions ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES deliverables(id) ON DELETE CASCADE;
