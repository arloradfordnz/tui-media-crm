-- lock accepted proposals and signed contracts
--
-- Once a client accepts a proposal or signs a contract, that is the record of
-- what was agreed. Nothing may change it afterwards: not Tui, not the editor,
-- not a script with the service role. The app refuses these edits too, but
-- this is the lock that cannot be talked around, because it sits under every
-- caller.
--
-- Accepted proposal: no update of any column (bar the updated_at the timestamp
-- trigger touches) and no delete.
--
-- Signed document: the agreement itself (the "form" inside content: the body,
-- the parties, the signature) and the row's name, type and client cannot
-- change, and it cannot be deleted. The rest of content may still change, so a
-- client can keep leaving portal feedback on a contract they have signed.
--
-- Deleting a job with an accepted proposal, or a client with a signed contract,
-- is refused by the same triggers: the cascade (proposals) or the set-null
-- (documents.client_id) is a change to the locked row.

create or replace function doc_form(content text) returns jsonb
language plpgsql immutable as $$
begin
  return (content::jsonb) -> 'form';
exception when others then
  -- Free-text documents are not JSON and can never be signed.
  return null;
end $$;

create or replace function doc_is_signed(content text) returns boolean
language sql immutable as $$
  select coalesce(doc_form(content) ->> 'clientSignature', '') <> ''
$$;

create or replace function lock_accepted_proposal() returns trigger
language plpgsql as $$
begin
  if old.status = 'accepted' then
    if tg_op = 'DELETE' then
      raise exception 'This proposal has been accepted by the client, so it is locked and cannot be deleted. Deleting its job or client is refused for the same reason.'
        using errcode = 'check_violation';
    end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'This proposal has been accepted by the client, so it is locked and cannot be changed.'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists proposals_lock_accepted on proposals;
create trigger proposals_lock_accepted
  before update or delete on proposals
  for each row execute function lock_accepted_proposal();

create or replace function lock_signed_document() returns trigger
language plpgsql as $$
begin
  if doc_is_signed(old.content) then
    if tg_op = 'DELETE' then
      raise exception 'This contract has been signed by the client, so it is locked and cannot be deleted. Deleting its client is refused for the same reason.'
        using errcode = 'check_violation';
    end if;
    if doc_form(new.content) is distinct from doc_form(old.content)
       or new.name is distinct from old.name
       or new.doc_type is distinct from old.doc_type
       or new.client_id is distinct from old.client_id then
      raise exception 'This contract has been signed by the client, so it is locked and cannot be changed.'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists documents_lock_signed on documents;
create trigger documents_lock_signed
  before update or delete on documents
  for each row execute function lock_signed_document();
