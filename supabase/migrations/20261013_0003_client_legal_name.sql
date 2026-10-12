-- client legal name
--
-- A contract has to name the client as the legal entity that is signing: a
-- company by its registered name ("Acme Plumbing Limited"), a sole trader as
-- "Jane Smith trading as Acme Plumbing". clients.name is whatever Arlo calls
-- them day to day, usually the trading name, so it is not enough on its own.
--
-- Tui asks for these the first time it drafts a contract for a client and
-- saves the answers here, so the question is never asked twice.

alter table clients add column if not exists legal_name  text;
alter table clients add column if not exists entity_type text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_entity_type_check') then
    alter table clients add constraint clients_entity_type_check
      check (entity_type is null or entity_type in ('company', 'sole_trader', 'partnership', 'other_entity', 'individual'));
  end if;
end $$;
