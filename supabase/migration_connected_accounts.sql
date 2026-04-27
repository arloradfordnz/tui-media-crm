-- Connected social accounts: stores OAuth tokens for platforms the studio
-- has linked (Instagram via Meta Graph API, Facebook Pages, eventually
-- TikTok). Tokens are persisted server-side so the analytics sync can
-- pull insights periodically without forcing a re-auth.

create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,                    -- 'instagram' | 'facebook' | 'tiktok' | 'youtube'
  account_id text,                           -- platform-native account id (e.g. IG business id)
  account_name text,                         -- display name shown in the UI
  access_token text not null,                -- long-lived token
  refresh_token text,                        -- only used by platforms that issue them
  token_type text,                           -- e.g. 'bearer'
  scope text,
  expires_at timestamptz,
  meta jsonb,                                -- extra platform-specific bookkeeping (page id, etc.)
  connected_at timestamptz default now(),
  unique (platform, account_id)
);

alter table connected_accounts enable row level security;

create policy "Authenticated users can read connected accounts"
  on connected_accounts for select to authenticated using (true);
create policy "Authenticated users can insert connected accounts"
  on connected_accounts for insert to authenticated with check (true);
create policy "Authenticated users can update connected accounts"
  on connected_accounts for update to authenticated using (true);
create policy "Authenticated users can delete connected accounts"
  on connected_accounts for delete to authenticated using (true);
