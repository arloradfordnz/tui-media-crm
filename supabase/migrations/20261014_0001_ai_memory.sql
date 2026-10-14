-- ai memory
--
-- Things Arlo tells Tui that should still be true next week: "a reel takes me
-- about an hour to edit", "Sky always wants captions burned in", "never book
-- shoots on a Sunday". Until now they lived only in the chat thread, and the
-- thread in context is the last eight or twelve messages, so they were
-- forgotten within a day.
--
-- Every memory is put into the system context on every turn (dashboard and
-- Telegram), so the table is meant to stay small: facts, not a diary. Arlo
-- can see and edit all of it under Settings → Memory.

create table if not exists ai_memories (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One of: workflow, pricing, client, preference, business. Free text in the
  -- column so a new category is a code change, not a migration.
  category    text not null default 'preference',
  content     text not null check (length(content) between 1 and 500),
  -- Optional link, so "Sky wants captions" shows against the client.
  client_id   uuid references clients(id) on delete set null,
  -- 'tui' when the assistant saved it, 'arlo' when typed in Settings.
  source      text not null default 'tui'
);

create index if not exists ai_memories_category_idx on ai_memories (category, created_at);

alter table ai_memories enable row level security;
create policy "admin_all" on ai_memories for all to authenticated
  using (is_admin()) with check (is_admin());
