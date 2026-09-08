-- ── The rebrand, at the database ────────────────────────────────────────────
--
-- Tui Media sells one-off, project-priced video ad campaigns:
--
--     Strategise → Script → Film → Edit → Launch & manage → Handover
--
-- The launch phase runs the ads for a fixed one-month window that is priced
-- into the single project fee, and at the end of it the footage, the cuts and
-- the ad account itself all go to the client. That shape is not expressible in
-- the schema as it stands: there is nowhere to record which ad account, what
-- the client is spending on media, when the month started, or when the handover
-- actually happened.
--
-- Two things this migration deliberately does NOT do:
--
--   1. It does not remove retainers. A few retainer clients are still on the
--      books and stay on the books until they are given notice. `retainer`,
--      `monthly_retainer` and `shoots_per_month` are untouched, and the new
--      `video_ads` category sits alongside them rather than replacing them.
--
--   2. It does not constrain industry to a niche list. The rebrand copy names
--      construction, marine, agriculture and tourism as who the work suits, but
--      that is positioning, not a filter — anything that broadly fits is worth
--      taking. `industry` is therefore free text with suggestions in the UI, not
--      an enum, and nothing in the app rejects a value that isn't on the list.
--
-- Safe to re-run.

-- ── Clients: the application form ───────────────────────────────────────────
-- The rebrand site replaced "book a call" with an application. Those answers
-- were going to hello@tuimedia.nz as an email and nowhere else, so a lead's
-- budget and decision-maker lived in an inbox rather than against the record.
-- app/api/enquiry/route.ts now writes them here.

alter table clients add column if not exists industry        text;
alter table clients add column if not exists sells           text;   -- "what do you sell?"
alter table clients add column if not exists customer_value  numeric; -- what one customer is worth
alter table clients add column if not exists ad_spend_budget numeric; -- monthly, paid direct by them
alter table clients add column if not exists decision_maker  text;   -- who signs it off
alter table clients add column if not exists capacity        text;   -- could they handle more work
alter table clients add column if not exists timeline        text;   -- when they want ads live

-- ── Clients and jobs: which brand ───────────────────────────────────────────
-- Tui Media (commercial video ads) is splitting from the personal/creative
-- brand. Existing rows are all Tui Media, so the backfill is unconditional.

alter table clients add column if not exists brand text default 'tui_media';
alter table jobs    add column if not exists brand text default 'tui_media';

update clients set brand = 'tui_media' where brand is null;
update jobs    set brand = 'tui_media' where brand is null;

-- ── Jobs: the managed campaign ──────────────────────────────────────────────
-- `quote_value` already holds the project fee. What was missing is everything
-- about the month of ads that fee buys.
--
-- ad_spend_budget is the CLIENT's media spend, which they pay the platform
-- directly. It is deliberately not folded into quote_value or lifetime_value:
-- it is not Tui Media's revenue and counting it as such would inflate every
-- financial figure in the CRM.

alter table jobs add column if not exists ad_platform         text;    -- Meta, Google, both
alter table jobs add column if not exists ad_account_ref      text;    -- the account being handed over
alter table jobs add column if not exists ad_spend_budget     numeric; -- client's spend, not revenue
alter table jobs add column if not exists campaign_launched_at timestamptz;
alter table jobs add column if not exists campaign_ends_at    timestamptz;
alter table jobs add column if not exists handover_at         timestamptz;

-- Launching sets the end of the managed month if it wasn't set by hand. Doing
-- it in a trigger rather than in the app means a campaign launched by the AI
-- assistant, by a SQL fix, or by a future integration gets the same deadline as
-- one launched through the UI — there is one definition of "a month from now"
-- and it lives here.
create or replace function set_campaign_window()
returns trigger as $$
begin
  if new.campaign_launched_at is not null
     and new.campaign_ends_at is null then
    new.campaign_ends_at := new.campaign_launched_at + interval '1 month';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists jobs_campaign_window on jobs;
create trigger jobs_campaign_window
  before insert or update on jobs
  for each row execute function set_campaign_window();

-- ── The video ad project template ───────────────────────────────────────────
-- The existing templates are wedding, anniversary, corporate, event, real
-- estate and custom — a photography business two business models ago. They are
-- left in place (old jobs reference them) but they are no longer what a new job
-- starts from.

insert into job_templates (id, job_type, name) values
  ('00000000-0000-0000-0000-000000000007', 'video_ads', 'Video Ad Project')
on conflict (job_type) do update set name = excluded.name;

-- Re-runnable: clear this template's rows before re-seeding them, so editing
-- the checklist below and re-running the file updates it instead of doubling it.
delete from template_tasks        where template_id = '00000000-0000-0000-0000-000000000007';
delete from template_deliverables where template_id = '00000000-0000-0000-0000-000000000007';

insert into template_tasks (template_id, phase, title, sort_order) values
  ('00000000-0000-0000-0000-000000000007', 'strategise', 'Kick-off call — offer, audience, what a customer is worth', 0),
  ('00000000-0000-0000-0000-000000000007', 'strategise', 'Agree the angle and the single action the ad asks for',    1),
  ('00000000-0000-0000-0000-000000000007', 'strategise', 'Confirm media spend and who pays the platform',            2),
  ('00000000-0000-0000-0000-000000000007', 'strategise', 'Get access to (or create) the ad account',                 3),

  ('00000000-0000-0000-0000-000000000007', 'script',     'Write the script',                                         4),
  ('00000000-0000-0000-0000-000000000007', 'script',     'Client sign-off on script',                                5),
  ('00000000-0000-0000-0000-000000000007', 'script',     'Shot list and schedule',                                   6),

  ('00000000-0000-0000-0000-000000000007', 'film',       'Confirm location, people and call time',                   7),
  ('00000000-0000-0000-0000-000000000007', 'film',       'Charge and prep gear',                                     8),
  ('00000000-0000-0000-0000-000000000007', 'film',       'Shoot day',                                                9),
  ('00000000-0000-0000-0000-000000000007', 'film',       'Back up footage (two copies before leaving)',              10),

  ('00000000-0000-0000-0000-000000000007', 'edit',       'First cut',                                                11),
  ('00000000-0000-0000-0000-000000000007', 'edit',       'Client review and revisions',                              12),
  ('00000000-0000-0000-0000-000000000007', 'edit',       'Cut the platform variants (aspect ratios, lengths)',       13),
  ('00000000-0000-0000-0000-000000000007', 'edit',       'Final export',                                             14),

  ('00000000-0000-0000-0000-000000000007', 'launch',     'Build campaign, audiences and tracking',                   15),
  ('00000000-0000-0000-0000-000000000007', 'launch',     'Launch — set the campaign start on the job',               16),
  ('00000000-0000-0000-0000-000000000007', 'launch',     'Week 1 check — spend pacing and early results',            17),
  ('00000000-0000-0000-0000-000000000007', 'launch',     'Week 2 check — cut what is not working',                   18),
  ('00000000-0000-0000-0000-000000000007', 'launch',     'Week 3 check',                                             19),
  ('00000000-0000-0000-0000-000000000007', 'launch',     'Week 4 — final numbers, write the wrap-up',                20),

  ('00000000-0000-0000-0000-000000000007', 'handover',   'Hand over the ad account (transfer admin, remove ours)',   21),
  ('00000000-0000-0000-0000-000000000007', 'handover',   'Hand over raw footage',                                    22),
  ('00000000-0000-0000-0000-000000000007', 'handover',   'Hand over final cuts and platform variants',               23),
  ('00000000-0000-0000-0000-000000000007', 'handover',   'Send the wrap-up and close the project',                   24),
  ('00000000-0000-0000-0000-000000000007', 'handover',   'Archive project files',                                    25);

insert into template_deliverables (template_id, title, description, sort_order) values
  ('00000000-0000-0000-0000-000000000007', 'Main Video Ad',    'The primary cut the campaign runs on',                0),
  ('00000000-0000-0000-0000-000000000007', 'Platform Variants','Aspect ratios and lengths for each placement',        1),
  ('00000000-0000-0000-0000-000000000007', 'Raw Footage',      'Everything shot, handed over at the end of the month', 2),
  ('00000000-0000-0000-0000-000000000007', 'Campaign Wrap-up', 'What ran, what it cost, what it did',                 3);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- The dashboard asks "which campaigns are live" and "which are past their
-- handover date" on every load.

create index if not exists jobs_campaign_ends_at_idx
  on jobs (campaign_ends_at) where campaign_ends_at is not null;
create index if not exists jobs_brand_idx on jobs (brand);
create index if not exists clients_brand_idx on clients (brand);
