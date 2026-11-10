-- Done and Snooze on Your week rows.
--
-- Rows used to clear only when the underlying thing changed, so a lead quiet
-- for 40 days or a job "untouched" for 37 sat on the home screen until Arlo
-- stopped reading it. Now any row can be put away.
--
-- `key` is the attention item id plus a version taken from the thing it is
-- about (lib/attention.ts), e.g. "lead:<client id>@<updated_at>". A Done is
-- stored with until = null and holds only while that version stands: once the
-- lead is touched or the job moves, the key changes and the row can come back
-- if it is still a problem. A Snooze sets until to a week out.

create table if not exists attention_dismissals (
  key         text primary key,
  until       timestamptz,
  created_at  timestamptz not null default now()
);

alter table attention_dismissals enable row level security;
create policy "admin_all" on attention_dismissals for all to authenticated
  using (is_admin()) with check (is_admin());
