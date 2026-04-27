'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchLinkStats, parseLink } from '@/lib/social-analytics'

type ActionResult = { error?: string; success?: boolean }

export async function trackSocialLink(prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const url = ((formData.get('url') as string) || '').trim()
  const clientId = ((formData.get('clientId') as string) || '').trim() || null
  const jobId = ((formData.get('jobId') as string) || '').trim() || null
  const notes = ((formData.get('notes') as string) || '').trim() || null

  if (!url) return { error: 'Paste a video link to track.' }

  const stats = await fetchLinkStats(url)
  // We still store rows even when the platform isn't fully supported yet — that
  // way the user sees their links in the list and can revisit once we add
  // OAuth. Stats just stay at 0 with sync_error populated.
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('social_links').upsert(
    {
      platform: stats.platform,
      url: stats.url,
      external_id: stats.externalId,
      title: stats.title,
      thumbnail_url: stats.thumbnailUrl,
      channel: stats.channel,
      published_at: stats.publishedAt,
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      duration_seconds: stats.durationSeconds,
      client_id: clientId,
      job_id: jobId,
      notes,
      last_synced_at: new Date().toISOString(),
      sync_error: stats.error,
    },
    { onConflict: 'platform,external_id', ignoreDuplicates: false },
  )

  if (error) return { error: error.message }
  revalidatePath('/dashboard/analytics')
  return { success: true }
}

export async function refreshSocialLink(linkId: string) {
  const supabase = await createServerSupabaseClient()
  const { data: row } = await supabase.from('social_links').select('id, url').eq('id', linkId).single()
  if (!row) return

  const stats = await fetchLinkStats(row.url)
  await supabase.from('social_links').update({
    platform: stats.platform,
    title: stats.title,
    thumbnail_url: stats.thumbnailUrl,
    channel: stats.channel,
    published_at: stats.publishedAt,
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
    duration_seconds: stats.durationSeconds,
    last_synced_at: new Date().toISOString(),
    sync_error: stats.error,
  }).eq('id', linkId)

  revalidatePath('/dashboard/analytics')
}

export async function refreshAllSocialLinks() {
  const supabase = await createServerSupabaseClient()
  const { data: rows } = await supabase.from('social_links').select('id, url')
  if (!rows?.length) return

  // Run in parallel with a small concurrency cap so we don't blow YouTube's
  // per-second quota when the user has dozens of tracked videos.
  const concurrency = 5
  for (let i = 0; i < rows.length; i += concurrency) {
    const slice = rows.slice(i, i + concurrency)
    await Promise.all(slice.map(async (r) => {
      const stats = await fetchLinkStats(r.url)
      await supabase.from('social_links').update({
        platform: stats.platform,
        title: stats.title,
        thumbnail_url: stats.thumbnailUrl,
        channel: stats.channel,
        published_at: stats.publishedAt,
        views: stats.views,
        likes: stats.likes,
        comments: stats.comments,
        duration_seconds: stats.durationSeconds,
        last_synced_at: new Date().toISOString(),
        sync_error: stats.error,
      }).eq('id', r.id)
    }))
  }

  revalidatePath('/dashboard/analytics')
}

export async function deleteSocialLink(linkId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('social_links').delete().eq('id', linkId)
  revalidatePath('/dashboard/analytics')
}

export async function previewLink(url: string) {
  // Lightweight helper for the "Add link" form — lets the UI show the
  // detected platform before the user submits.
  return parseLink(url)
}
