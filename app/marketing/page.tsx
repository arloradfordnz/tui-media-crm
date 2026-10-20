import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase-admin'
import { getMarketingViewer } from '@/lib/marketer-auth'
import { signedDownloadUrl, signedDownloadUrlAttachment } from '@/lib/r2'
import PortalSignOut from '../portal/me/PortalSignOut'

export const metadata: Metadata = { title: 'Videos — Tui Media' }
export const dynamic = 'force-dynamic'

type Row = {
  id: string
  original_name: string
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  version_label: string
  approved_at: string | null
  created_at: string
  deliverables: { title: string; jobs: { name: string; clients: { name: string } | null } | null } | null
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i
const isExternal = (u: string | null) => !!u && /^https?:\/\//.test(u)

/**
 * The marketer's library: every APPROVED video, newest first, to watch and
 * download. Read-only — there is no action on this page that writes anything.
 *
 * Reads with the service role because the marketer's own token is denied by
 * RLS everywhere (is_admin() is false for them), which is the point. The role
 * is checked first, from the verified user, and the query below is the whole
 * of what they can reach: no client contact details, money, or documents.
 *
 * Only `approved` files are listed, so a draft cut the client hasn't signed off
 * never reaches marketing. Widen the filter below if that's too strict.
 */
export default async function MarketingPage() {
  const viewer = await getMarketingViewer()
  if (!viewer) redirect('/login')

  const admin = createAdminClient()
  if (!admin) redirect('/login')

  const { data } = await admin
    .from('delivery_files')
    .select('id, original_name, file_name, file_url, mime_type, version_label, approved_at, created_at, deliverables(title, jobs(name, clients(name)))')
    .eq('delivery_status', 'approved')
    .is('archived_at', null)
    .order('approved_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.mime_type?.startsWith('video/') || VIDEO_EXT.test(r.original_name),
  )

  // Signed for a few hours: long enough to watch and download in one sitting,
  // short enough that a copied link dies. The page is re-rendered on every visit.
  const TTL = 60 * 60 * 6
  const videos = await Promise.all(
    rows.map(async (r) => {
      let playUrl: string | null = null
      let downloadUrl: string | null = null
      if (isExternal(r.file_url)) {
        playUrl = downloadUrl = r.file_url
      } else if (r.file_name) {
        try {
          ;[playUrl, downloadUrl] = await Promise.all([
            signedDownloadUrl(r.file_name, TTL),
            signedDownloadUrlAttachment(r.file_name, r.original_name, TTL),
          ])
        } catch { /* leave null: the card says so */ }
      }
      const job = r.deliverables?.jobs
      return {
        id: r.id,
        name: r.original_name,
        mime: r.mime_type,
        version: r.version_label,
        title: r.deliverables?.title ?? '',
        project: job?.name ?? '',
        client: job?.clients?.name ?? '',
        playUrl,
        downloadUrl,
      }
    }),
  )

  return (
    <div className="min-h-screen px-6 py-8" style={{ background: 'var(--bg-base)' }}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between mb-10">
          <Image className="logo-light" src="/Primary_Black.svg" alt="Tui Media" width={150} height={31} priority />
          <Image className="logo-dark" src="/Primary_White.svg" alt="Tui Media" width={150} height={31} priority />
          <PortalSignOut />
        </div>

        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Videos
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          Approved videos, newest first. Watch them here or download the file.
        </p>

        {videos.length === 0 ? (
          <div className="card text-sm" style={{ color: 'var(--text-secondary)' }}>
            No approved videos yet. They appear here as soon as a client signs one off.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {videos.map((v) => (
              <div key={v.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {v.playUrl ? (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full"
                    style={{ aspectRatio: '16 / 9', background: '#060D1A', display: 'block' }}
                  >
                    <source src={v.playUrl} type={v.mime || undefined} />
                  </video>
                ) : (
                  <div className="w-full flex items-center justify-center text-sm" style={{ aspectRatio: '16 / 9', background: '#060D1A', color: '#8996B2' }}>
                    Preview unavailable
                  </div>
                )}
                <div className="p-4">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {[v.client, v.project].filter(Boolean).join(' · ') || v.name}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    {[v.title, v.name].filter(Boolean).join(' · ')}
                  </p>
                  {v.downloadUrl && (
                    <a href={v.downloadUrl} className="btn-ghost btn-sm mt-3 inline-flex">
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
