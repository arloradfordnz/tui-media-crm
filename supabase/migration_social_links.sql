-- Social / video analytics: tracked public links (YouTube / Vimeo for v1).
-- Each row represents one external video URL whose stats we periodically refresh.

create table if not exists social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null,                    -- 'youtube' | 'vimeo' | 'instagram' | 'tiktok' | 'other'
  url text not null,
  external_id text,                          -- platform-native id (e.g. YouTube videoId)
  title text,
  thumbnail_url text,
  channel text,                              -- channel/uploader name
  published_at timestamptz,                  -- when the video was originally posted
  views bigint default 0,
  likes bigint default 0,
  comments bigint default 0,
  duration_seconds integer,
  client_id uuid references clients(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  notes text,
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz default now(),
  unique (platform, external_id)
);

create index if not exists social_links_client_id_idx on social_links(client_id);
create index if not exists social_links_job_id_idx on social_links(job_id);
create index if not exists social_links_platform_idx on social_links(platform);

alter table social_links enable row level security;

create policy "Authenticated users can read social links"
  on social_links for select to authenticated using (true);

create policy "Authenticated users can insert social links"
  on social_links for insert to authenticated with check (true);

create policy "Authenticated users can update social links"
  on social_links for update to authenticated using (true);

create policy "Authenticated users can delete social links"
  on social_links for delete to authenticated using (true);
