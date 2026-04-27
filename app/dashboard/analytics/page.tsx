import { createServerSupabaseClient } from '@/lib/supabase'
import AnalyticsView, { type SocialLink, type ClientOption } from './AnalyticsView'
import MigrationNotice from './MigrationNotice'

export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient()

  const [linksRes, clientsRes, jobsRes, accountsRes] = await Promise.all([
    supabase
      .from('social_links')
      .select('id, platform, url, external_id, title, thumbnail_url, channel, published_at, views, likes, comments, duration_seconds, client_id, job_id, notes, last_synced_at, sync_error, created_at, source, clients(name), jobs(name)')
      // Newest first by published date (when posted on the platform), falling
      // back to when the row was added to our system for legacy rows.
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('jobs').select('id, name').order('created_at', { ascending: false }),
    supabase.from('connected_accounts').select('id, platform, account_name, account_id, connected_at, expires_at'),
  ])

  // If either table is missing, show the migration walkthrough instead of crashing.
  const missingSocialLinks = linksRes.error?.code === 'PGRST205' || /social_links/.test(linksRes.error?.message ?? '') && /not.*find/i.test(linksRes.error?.message ?? '')
  const missingAccounts = accountsRes.error?.code === 'PGRST205' || (/connected_accounts/.test(accountsRes.error?.message ?? '') && /not.*find/i.test(accountsRes.error?.message ?? ''))
  if (missingSocialLinks || missingAccounts) {
    return <MigrationNotice missingSocialLinks={!!missingSocialLinks} missingAccounts={!!missingAccounts} />
  }

  type RawRow = {
    id: string
    platform: string
    url: string
    external_id: string | null
    title: string | null
    thumbnail_url: string | null
    channel: string | null
    published_at: string | null
    views: number | null
    likes: number | null
    comments: number | null
    duration_seconds: number | null
    client_id: string | null
    job_id: string | null
    notes: string | null
    last_synced_at: string | null
    sync_error: string | null
    created_at: string
    source: string | null
    clients?: { name: string } | null
    jobs?: { name: string } | null
  }

  const links: SocialLink[] = ((linksRes.data as unknown as RawRow[] | null) ?? []).map((r) => ({
    id: r.id,
    platform: r.platform,
    url: r.url,
    externalId: r.external_id,
    title: r.title,
    thumbnailUrl: r.thumbnail_url,
    channel: r.channel,
    publishedAt: r.published_at,
    views: r.views ?? 0,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    durationSeconds: r.duration_seconds,
    clientId: r.client_id,
    jobId: r.job_id,
    clientName: r.clients?.name ?? null,
    jobName: r.jobs?.name ?? null,
    notes: r.notes,
    lastSyncedAt: r.last_synced_at,
    syncError: r.sync_error,
    createdAt: r.created_at,
    source: (r.source ?? 'manual') as 'manual' | 'connected',
  }))

  const clients: ClientOption[] = (clientsRes.data ?? []).map((c) => ({ id: c.id, name: c.name }))
  const jobs: ClientOption[] = (jobsRes.data ?? []).map((j) => ({ id: j.id, name: j.name }))

  type RawAccount = { id: string; platform: string; account_name: string | null; account_id: string | null; connected_at: string; expires_at: string | null }
  const accounts = ((accountsRes.data as RawAccount[] | null) ?? []).map((a) => ({
    id: a.id,
    platform: a.platform,
    accountName: a.account_name,
    accountId: a.account_id,
    connectedAt: a.connected_at,
    expiresAt: a.expires_at,
  }))

  return <AnalyticsView links={links} clients={clients} jobs={jobs} accounts={accounts} />
}
