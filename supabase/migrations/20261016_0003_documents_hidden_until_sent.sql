-- documents are hidden from the client portal until they are sent
--
-- A document Arlo has drafted (or had Tui draft) is his to finish. It only
-- appears in the client's portal once it has been sent: either emailed from the
-- document page, or published there without an email. documents.sent_at
-- (20261016_0002) is that moment; null means not sent, and the portal skips it.
--
-- Before this, every document with a client showed in their portal at once, so
-- the ones already out there must stay visible. The sent date is worked out
-- from what is known:
--   signed or opened by the client  -> they plainly have it: sent when created
--   the client was emailed a document after this one was made
--                                   -> sent at that email
-- Anything else is a draft and goes back to being hidden.

update documents d
set sent_at = coalesce(
  d.sent_at,
  (select min(l.created_at) from email_logs l
     where l.client_id = d.client_id and l.type = 'document_to_client' and l.status = 'sent' and l.created_at >= d.created_at),
  d.created_at
)
where d.sent_at is null
  and d.client_id is not null
  and (
    d.viewed_at is not null
    or doc_is_signed(d.content)
    or exists (select 1 from email_logs l
                 where l.client_id = d.client_id and l.type = 'document_to_client' and l.status = 'sent' and l.created_at >= d.created_at)
  );
