-- The email_logs.type CHECK constraint hardcoded a fixed list of types
-- (welcome, proposal, proposal_accepted, delivery, revision, approval) which
-- silently rejected every admin_* notification (admin_delivery_viewed,
-- admin_document_signed, etc.) — those emails sent via Resend but never
-- showed up in the Email Log dashboard.
--
-- type is an informational label, not a security boundary, so we just drop
-- the constraint. Add new types freely from now on.

alter table email_logs drop constraint if exists email_logs_type_check;
