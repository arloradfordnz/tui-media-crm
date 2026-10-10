-- document_templates
--
-- The default wording for a new Contract. It used to exist only in the head of
-- whoever was drafting: the tui-contract skill carried the five standard
-- sections as prose, and the Documents page started every contract from a
-- blank box. Now the standard contract is a row, so the CRM can edit it
-- (Documents > Contract template) and Tui can edit it ("change the
-- cancellation wording"), and every new contract starts from the same text.
--
-- One row per template name ('Contract' today). Only the body is stored; the
-- look of the PDF is code (TuiPdfDocument.tsx) and stays fixed on purpose.
-- Square brackets mark the blanks a person or Tui fills per client.
--
-- The seed matches DEFAULT_CONTRACT_BODY in lib/document-templates.ts, which is
-- also what the app falls back to if the row is ever deleted.

create table if not exists document_templates (
  template    text primary key,
  body        text not null,
  updated_at  timestamptz not null default now()
);

alter table document_templates enable row level security;
create policy "admin_all" on document_templates for all to authenticated
  using (is_admin()) with check (is_admin());

insert into document_templates (template, body) values ('Contract',
'# Scope of Work
Tui Media will strategise, script, film, edit, and launch and manage [number] video ads for [client]. [One or two plain sentences on what is being made and where it will run.]

# Payment
The project fee is [project fee] (excluding GST), covering the whole project including one month of launching and managing the ads. It is payable [payment schedule]. Ad spend is separate and is paid by the client directly to the ad platform, so nothing is marked up. Tui Media does not guarantee any particular result from the ads.

# Timeline
Filming takes place on [shoot date]. The edited videos are delivered by [delivery date]. The ads then launch and are managed for one month, starting [launch date].

# Ownership & Handover
At the end of the month the client receives everything: the raw footage, the final edited videos, and the ad account itself.

# Cancellation
Either side can cancel before filming by telling the other in writing. Work completed to that point is invoiced. This is a one-off project with no retainer and no lock-in.')
on conflict (template) do nothing;
