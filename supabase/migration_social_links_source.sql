-- Distinguish auto-synced posts (from a connected account) vs links the
-- user pasted manually so the analytics page can render them in separate
-- sections.
alter table social_links
  add column if not exists source text default 'manual';

create index if not exists social_links_source_idx on social_links(source);
