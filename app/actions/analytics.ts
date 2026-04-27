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

/**
 * Pull the latest media + insights for every connected Instagram account
 * and upsert each post as a row in `social_links`. Run on demand from the
 * Analytics page; safe to call repeatedly.
 */
export async function syncInstagramAccounts(): Promise<{ ok: number; failed: number; error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: accounts, error } = await supabase
    .from('connected_accounts')
    .select('id, account_id, access_token, account_name')
    .eq('platform', 'instagram')

  if (error) return { ok: 0, failed: 0, error: error.message }
  if (!accounts?.length) return { ok: 0, failed: 0, error: 'No Instagram accounts connected.' }

  let ok = 0
  let failed = 0

  for (const acct of accounts) {
    try {
      const fields = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count'
      const mediaUrl = `https://graph.facebook.com/v19.0/${acct.account_id}/media?fields=${fields}&limit=50&access_token=${encodeURIComponent(acct.access_token)}`
      const res = await fetch(mediaUrl, { cache: 'no-store' })
      if (!res.ok) {
        failed++
        continue
      }
      const data = await res.json() as { data: Array<{ id: string; caption?: string; media_type: string; media_product_type?: string; permalink: string; thumbnail_url?: string; media_url?: string; timestamp: string; like_count?: number; comments_count?: number }> }

      // Pull insights per media item — different metrics depending on media type.
      const rows = await Promise.all((data.data ?? []).map(async (m) => {
        let views = 0
        // For Reels and Videos, "plays" was deprecated in favour of "video_views" and now "ig_reels_video_view_total_count".
        // Use the simplest available signal that still works on Graph v19.
        const isVideo = m.media_type === 'VIDEO' || m.media_product_type === 'REELS'
        try {
          if (isVideo) {
            const metric = m.media_product_type === 'REELS' ? 'ig_reels_video_view_total_count' : 'video_views'
            const insightsRes = await fetch(
              `https://graph.facebook.com/v19.0/${m.id}/insights?metric=${metric}&access_token=${encodeURIComponent(acct.access_token)}`,
              { cache: 'no-store' },
            )
            if (insightsRes.ok) {
              const ins = await insightsRes.json() as { data: Array<{ values: Array<{ value: number }> }> }
              views = ins.data?.[0]?.values?.[0]?.value ?? 0
            }
          }
        } catch { /* tolerate insights errors so the title/like data still saves */ }

        const titleSource = (m.caption ?? '').trim()
        const title = titleSource ? titleSource.split('\n')[0].slice(0, 140) : `Instagram ${m.media_type.toLowerCase()}`

        return {
          platform: 'instagram',
          url: m.permalink,
          external_id: m.id,
          title,
          thumbnail_url: m.thumbnail_url || m.media_url || null,
          channel: acct.account_name,
          published_at: m.timestamp,
          views,
          likes: m.like_count ?? 0,
          comments: m.comments_count ?? 0,
          duration_seconds: null,
          last_synced_at: new Date().toISOString(),
          sync_error: null,
        }
      }))

      if (rows.length) {
        await supabase.from('social_links').upsert(rows, { onConflict: 'platform,external_id', ignoreDuplicates: false })
      }
      ok++
    } catch {
      failed++
    }
  }

  revalidatePath('/dashboard/analytics')
  return { ok, failed }
}

export async function disconnectAccount(accountId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('connected_accounts').delete().eq('id', accountId)
  revalidatePath('/dashboard/analytics')
}
