'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Analytics is now driven entirely by connected accounts (currently
 * Instagram via Meta Graph API; Facebook + TikTok + YouTube channel
 * coming via separate OAuth flows). The "paste a public link" feature
 * was removed because per-post view counts aren't exposed by IG / TikTok
 * APIs for posts the user doesn't own, and we don't want to ship dead
 * UI that promises stats it can't deliver.
 */

export async function deleteSocialLink(linkId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('social_links').delete().eq('id', linkId)
  revalidatePath('/dashboard/analytics')
}

/**
 * Re-sync every connected account (IG today; FB / TikTok / YouTube
 * channel as they're added). Single button on the analytics page.
 */
export async function refreshAllConnectedAccounts(): Promise<{ ok: number; failed: number; error?: string }> {
  return syncInstagramAccounts()
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
      // Instagram Login flow uses graph.instagram.com (not graph.facebook.com).
      // The /me/media shortcut works because the token is scoped to one account.
      const fields = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count'
      const mediaUrl = `https://graph.instagram.com/v22.0/me/media?fields=${fields}&limit=50&access_token=${encodeURIComponent(acct.access_token)}`
      const res = await fetch(mediaUrl, { cache: 'no-store' })
      if (!res.ok) {
        failed++
        continue
      }
      const data = await res.json() as { data: Array<{ id: string; caption?: string; media_type: string; media_product_type?: string; permalink: string; thumbnail_url?: string; media_url?: string; timestamp: string; like_count?: number; comments_count?: number }> }

      // Pull insights per media item — different metrics depending on media type.
      const rows = await Promise.all((data.data ?? []).map(async (m) => {
        let views = 0
        const isVideo = m.media_type === 'VIDEO' || m.media_product_type === 'REELS'
        try {
          if (isVideo) {
            // 2026 metric naming: 'views' is the unified replacement for plays/video_views/reels_video_view_total_count.
            const insightsRes = await fetch(
              `https://graph.instagram.com/v22.0/${m.id}/insights?metric=views&access_token=${encodeURIComponent(acct.access_token)}`,
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
          source: 'connected' as const,
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
