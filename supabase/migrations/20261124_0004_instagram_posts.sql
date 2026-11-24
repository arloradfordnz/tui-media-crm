-- Tui Media's own Instagram: two posts a week (agreed 15 November 2026).
--
-- There is no Instagram connection, so a post is logged by hand (Posted it on
-- the Today row). Two slots a week, Tuesday and Friday (lib/instagram-slots.ts),
-- show on the calendar and are counted against these rows.
create table if not exists social_posts (
  id          uuid primary key default gen_random_uuid(),
  posted_on   date not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists social_posts_posted_on_idx on social_posts(posted_on);

alter table social_posts enable row level security;
create policy "admin_all" on social_posts for all to authenticated
  using (is_admin()) with check (is_admin());
