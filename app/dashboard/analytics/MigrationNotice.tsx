import { Database, ExternalLink } from 'lucide-react'

const SOCIAL_LINKS_SQL = `create table if not exists social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text not null,
  external_id text,
  title text,
  thumbnail_url text,
  channel text,
  published_at timestamptz,
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
  on social_links for delete to authenticated using (true);`

const CONNECTED_ACCOUNTS_SQL = `create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  account_id text,
  account_name text,
  access_token text not null,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  meta jsonb,
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
  on connected_accounts for delete to authenticated using (true);`

export default function MigrationNotice({
  missingSocialLinks,
  missingAccounts,
}: {
  missingSocialLinks: boolean
  missingAccounts: boolean
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Analytics</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          One quick database step before this page can load.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Run the analytics migration</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          The Supabase database doesn&apos;t have the analytics tables yet. Open the SQL editor in your Supabase project and paste the SQL below, then refresh this page.
        </p>
        <a
          href="https://supabase.com/dashboard/project/_/sql/new"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-sm w-fit"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open Supabase SQL editor
        </a>

        {missingSocialLinks && (
          <details open className="rounded-lg" style={{ background: 'var(--bg-elevated)', padding: '12px' }}>
            <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              1. <code>social_links</code> table SQL
            </summary>
            <pre className="text-xs mt-3 overflow-x-auto" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{SOCIAL_LINKS_SQL}</pre>
          </details>
        )}

        {missingAccounts && (
          <details open className="rounded-lg" style={{ background: 'var(--bg-elevated)', padding: '12px' }}>
            <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {missingSocialLinks ? '2.' : '1.'} <code>connected_accounts</code> table SQL
            </summary>
            <pre className="text-xs mt-3 overflow-x-auto" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{CONNECTED_ACCOUNTS_SQL}</pre>
          </details>
        )}

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Both files also live in the repo at <code>supabase/migration_social_links.sql</code> and <code>supabase/migration_connected_accounts.sql</code>.
        </p>
      </div>
    </div>
  )
}
