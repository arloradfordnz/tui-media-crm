import { createServerSupabaseClient } from '@/lib/supabase'
import AnalyticsView, { type SocialLink, type ClientOption } from './AnalyticsView'

export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient()

  const [linksRes, clientsRes, jobsRes] = await Promise.all([
    supabase
      .from('social_links')
      .select('id, platform, url, external_id, title, thumbnail_url, channel, published_at, views, likes, comments, duration_seconds, client_id, job_id, notes, last_synced_at, sync_error, created_at, clients(name), jobs(name)')
      .order('views', { ascending: false }),
    supabase.from('clients').select('id, name').order('name', { ascending: true }),
    supabase.from('jobs').select('id, name').order('created_at', { ascending: false }),
  ])

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
  }))

  const clients: ClientOption[] = (clientsRes.data ?? []).map((c) => ({ id: c.id, name: c.name }))
  const jobs: ClientOption[] = (jobsRes.data ?? []).map((j) => ({ id: j.id, name: j.name }))

  return <AnalyticsView links={links} clients={clients} jobs={jobs} />
}
