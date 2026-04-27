/**
 * Public-link analytics for video URLs the studio shares with clients.
 *
 * v1 supports YouTube (via the YouTube Data API v3) and Vimeo (via oEmbed).
 * Instagram / TikTok / Facebook all require OAuth + Business-account
 * approval, so we only detect those platforms today and surface a friendly
 * "connect account" placeholder in the UI.
 */

export type Platform = 'youtube' | 'vimeo' | 'instagram' | 'tiktok' | 'facebook' | 'other'

export type ParsedLink = {
  platform: Platform
  externalId: string | null
  url: string
}

export type LinkStats = {
  platform: Platform
  externalId: string | null
  url: string
  title: string | null
  thumbnailUrl: string | null
  channel: string | null
  publishedAt: string | null
  views: number
  likes: number
  comments: number
  durationSeconds: number | null
  /**
   * If the platform is supported but the fetch failed, surface a human
   * message so the UI can render it instead of throwing. If the platform
   * isn't supported yet, this is set to a "coming soon" notice and stats
   * stay at 0.
   */
  error: string | null
}

const YOUTUBE_PATTERNS: RegExp[] = [
  /youtube\.com\/watch\?[^#]*?\bv=([\w-]{11})/i,
  /youtube\.com\/shorts\/([\w-]{11})/i,
  /youtu\.be\/([\w-]{11})/i,
  /youtube\.com\/embed\/([\w-]{11})/i,
]

export function parseLink(rawUrl: string): ParsedLink {
  const url = rawUrl.trim()
  for (const re of YOUTUBE_PATTERNS) {
    const m = url.match(re)
    if (m) return { platform: 'youtube', externalId: m[1], url }
  }
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
  if (vimeo) return { platform: 'vimeo', externalId: vimeo[1], url }
  if (/instagram\.com\/(?:p|reel|tv)\//i.test(url)) {
    return { platform: 'instagram', externalId: null, url }
  }
  if (/tiktok\.com\//i.test(url)) {
    return { platform: 'tiktok', externalId: null, url }
  }
  if (/facebook\.com\//i.test(url) || /fb\.watch\//i.test(url)) {
    return { platform: 'facebook', externalId: null, url }
  }
  return { platform: 'other', externalId: null, url }
}

/** ISO 8601 duration ("PT3M21S") → integer seconds. */
function isoDurationToSeconds(d: string | null | undefined): number | null {
  if (!d) return null
  const m = d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const [, h, mi, s] = m
  return (parseInt(h ?? '0') * 3600) + (parseInt(mi ?? '0') * 60) + parseInt(s ?? '0')
}

async function fetchYouTube(parsed: ParsedLink): Promise<LinkStats> {
  const apiKey = process.env.YOUTUBE_API_KEY
  const base: LinkStats = {
    platform: 'youtube',
    externalId: parsed.externalId,
    url: parsed.url,
    title: null,
    thumbnailUrl: null,
    channel: null,
    publishedAt: null,
    views: 0,
    likes: 0,
    comments: 0,
    durationSeconds: null,
    error: null,
  }
  if (!parsed.externalId) {
    return { ...base, error: 'Could not extract a YouTube video id from that URL.' }
  }
  if (!apiKey) {
    return { ...base, error: 'YOUTUBE_API_KEY is not set on the server.' }
  }

  const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos')
  endpoint.searchParams.set('id', parsed.externalId)
  endpoint.searchParams.set('part', 'snippet,statistics,contentDetails')
  endpoint.searchParams.set('key', apiKey)

  try {
    const res = await fetch(endpoint, { cache: 'no-store' })
    if (!res.ok) {
      return { ...base, error: `YouTube API responded ${res.status}` }
    }
    const data = await res.json() as {
      items?: Array<{
        snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } }
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
        contentDetails?: { duration?: string }
      }>
    }
    const item = data.items?.[0]
    if (!item) {
      return { ...base, error: 'Video not found or is private.' }
    }
    const t = item.snippet?.thumbnails
    return {
      ...base,
      title: item.snippet?.title ?? null,
      channel: item.snippet?.channelTitle ?? null,
      publishedAt: item.snippet?.publishedAt ?? null,
      thumbnailUrl: t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null,
      views: parseInt(item.statistics?.viewCount ?? '0') || 0,
      likes: parseInt(item.statistics?.likeCount ?? '0') || 0,
      comments: parseInt(item.statistics?.commentCount ?? '0') || 0,
      durationSeconds: isoDurationToSeconds(item.contentDetails?.duration),
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'Network error fetching YouTube stats.' }
  }
}

async function fetchVimeo(parsed: ParsedLink): Promise<LinkStats> {
  const base: LinkStats = {
    platform: 'vimeo',
    externalId: parsed.externalId,
    url: parsed.url,
    title: null,
    thumbnailUrl: null,
    channel: null,
    publishedAt: null,
    views: 0,
    likes: 0,
    comments: 0,
    durationSeconds: null,
    error: null,
  }

  // Vimeo's public oEmbed gives title/thumbnail/duration but not view counts.
  // For view counts a Vimeo OAuth token is required; flag that for now so the
  // user knows their tracked Vimeo links won't have view numbers until we add
  // VIMEO_ACCESS_TOKEN support.
  try {
    const oembed = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.url)}`, { cache: 'no-store' })
    if (!oembed.ok) {
      return { ...base, error: `Vimeo oEmbed responded ${oembed.status}` }
    }
    const data = await oembed.json() as { title?: string; thumbnail_url?: string; author_name?: string; upload_date?: string; duration?: number }
    const accessToken = process.env.VIMEO_ACCESS_TOKEN
    let views = 0, likes = 0, comments = 0
    let viewError: string | null = null

    if (accessToken && parsed.externalId) {
      try {
        const apiRes = await fetch(`https://api.vimeo.com/videos/${parsed.externalId}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (apiRes.ok) {
          const apiData = await apiRes.json() as { stats?: { plays?: number }; metadata?: { connections?: { likes?: { total?: number }; comments?: { total?: number } } } }
          views = apiData.stats?.plays ?? 0
          likes = apiData.metadata?.connections?.likes?.total ?? 0
          comments = apiData.metadata?.connections?.comments?.total ?? 0
        } else {
          viewError = `Vimeo API responded ${apiRes.status}`
        }
      } catch {
        viewError = 'Network error fetching Vimeo stats.'
      }
    } else {
      viewError = 'View counts require VIMEO_ACCESS_TOKEN.'
    }

    return {
      ...base,
      title: data.title ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
      channel: data.author_name ?? null,
      publishedAt: data.upload_date ?? null,
      durationSeconds: typeof data.duration === 'number' ? data.duration : null,
      views,
      likes,
      comments,
      error: viewError,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'Network error fetching Vimeo data.' }
  }
}

export async function fetchLinkStats(rawUrl: string): Promise<LinkStats> {
  const parsed = parseLink(rawUrl)
  if (parsed.platform === 'youtube') return fetchYouTube(parsed)
  if (parsed.platform === 'vimeo') return fetchVimeo(parsed)
  return {
    platform: parsed.platform,
    externalId: null,
    url: parsed.url,
    title: null,
    thumbnailUrl: null,
    channel: null,
    publishedAt: null,
    views: 0,
    likes: 0,
    comments: 0,
    durationSeconds: null,
    error:
      parsed.platform === 'other'
        ? 'Unsupported URL — paste a YouTube or Vimeo link.'
        : `${parsed.platform[0].toUpperCase()}${parsed.platform.slice(1)} support is coming soon — connecting your account is required for stats.`,
  }
}
