'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import {
  BarChart3,
  Eye,
  Heart,
  MessageSquare,
  RefreshCw,
  Trash2,
  Plus,
  ExternalLink,
  AlertCircle,
  Clock,
} from 'lucide-react'
import PlatformIcon from '@/components/PlatformIcon'
import {
  trackSocialLink,
  refreshSocialLink,
  refreshAllSocialLinks,
  deleteSocialLink,
  syncInstagramAccounts,
  disconnectAccount,
} from '@/app/actions/analytics'

export type SocialLink = {
  id: string
  platform: string
  url: string
  externalId: string | null
  title: string | null
  thumbnailUrl: string | null
  channel: string | null
  publishedAt: string | null
  views: number
  likes: number
  comments: number
  durationSeconds: number | null
  clientId: string | null
  jobId: string | null
  clientName: string | null
  jobName: string | null
  notes: string | null
  lastSyncedAt: string | null
  syncError: string | null
  createdAt: string
}

export type ClientOption = { id: string; name: string }

export type ConnectedAccount = {
  id: string
  platform: string
  accountName: string | null
  accountId: string | null
  connectedAt: string
  expiresAt: string | null
}

const PLATFORM_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  other: 'Other',
}

function compactNumber(n: number): string {
  if (n < 1000) return n.toLocaleString()
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86_400)}d ago`
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AnalyticsView({
  links,
  clients,
  jobs,
  accounts,
}: {
  links: SocialLink[]
  clients: ClientOption[]
  jobs: ClientOption[]
  accounts: ConnectedAccount[]
}) {
  const [adding, setAdding] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string | 'all'>('all')
  const [pending, startTransition] = useTransition()
  const [oauthMsg, setOauthMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('ig_connected') === '1') {
      setOauthMsg({ kind: 'success', text: 'Instagram connected. Click Sync to pull your posts.' })
    } else if (params.has('ig_error')) {
      setOauthMsg({ kind: 'error', text: params.get('ig_error') || 'Couldn\'t connect Instagram.' })
    }
    if (params.has('ig_connected') || params.has('ig_error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const totals = useMemo(() => {
    return links.reduce(
      (acc, l) => {
        acc.views += l.views
        acc.likes += l.likes
        acc.comments += l.comments
        return acc
      },
      { views: 0, likes: 0, comments: 0 },
    )
  }, [links])

  const breakdown = useMemo(() => {
    const map = new Map<string, { count: number; views: number }>()
    for (const l of links) {
      const cur = map.get(l.platform) ?? { count: 0, views: 0 }
      cur.count++
      cur.views += l.views
      map.set(l.platform, cur)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].views - a[1].views)
  }, [links])

  const visibleLinks = useMemo(() => {
    if (filterPlatform === 'all') return links
    return links.filter((l) => l.platform === filterPlatform)
  }, [links, filterPlatform])

  function handleRefreshAll() {
    startTransition(async () => {
      await refreshAllSocialLinks()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Analytics</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Track public stats across YouTube, Vimeo, and the rest of your channels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefreshAll} disabled={pending || links.length === 0} className="btn-secondary text-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Refreshing...' : 'Refresh all'}
          </button>
          <button onClick={() => setAdding((v) => !v)} className="btn-primary text-sm">
            <Plus className="w-3.5 h-3.5" />
            {adding ? 'Close' : 'Add video link'}
          </button>
        </div>
      </div>

      {oauthMsg && (
        <div
          className="rounded-lg p-3 text-sm flex items-center gap-2"
          style={{
            background: 'var(--bg-elevated)',
            border: `1px solid ${oauthMsg.kind === 'success' ? 'var(--accent)' : 'var(--danger)'}`,
            color: 'var(--text-primary)',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" style={{ color: oauthMsg.kind === 'success' ? 'var(--accent)' : 'var(--danger)' }} />
          <span className="flex-1">{oauthMsg.text}</span>
          <button onClick={() => setOauthMsg(null)} className="btn-icon" aria-label="Dismiss">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {adding && <AddLinkForm clients={clients} jobs={jobs} onDone={() => setAdding(false)} />}

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <TotalCard icon={Eye} label="All-time views" value={compactNumber(totals.views)} subValue={totals.views.toLocaleString()} />
        <TotalCard icon={Heart} label="Total likes" value={compactNumber(totals.likes)} subValue={totals.likes.toLocaleString()} />
        <TotalCard icon={MessageSquare} label="Total comments" value={compactNumber(totals.comments)} subValue={totals.comments.toLocaleString()} />
        <TotalCard icon={BarChart3} label="Tracked videos" value={links.length.toString()} subValue={`${breakdown.length} platform${breakdown.length === 1 ? '' : 's'}`} />
      </div>

      {/* Platform breakdown */}
      {breakdown.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Platform breakdown</h2>
          <div className="space-y-3">
            {breakdown.map(([platform, info]) => {
              const pct = totals.views === 0 ? 0 : (info.views / totals.views) * 100
              return (
                <button
                  key={platform}
                  onClick={() => setFilterPlatform((cur) => (cur === platform ? 'all' : platform))}
                  className="w-full text-left"
                  style={{ outline: 'none' }}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <PlatformIcon platform={platform} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {PLATFORM_LABEL[platform] ?? platform}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{info.count} video{info.count === 1 ? '' : 's'}</span>
                    <span className="text-xs ml-auto font-medium" style={{ color: filterPlatform === platform ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {compactNumber(info.views)} views
                    </span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'var(--bg-elevated)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 200ms' }} />
                  </div>
                </button>
              )
            })}
          </div>
          {filterPlatform !== 'all' && (
            <button onClick={() => setFilterPlatform('all')} className="mt-3 text-xs" style={{ color: 'var(--accent)' }}>
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Connected accounts */}
      <ConnectedAccounts accounts={accounts} />

      {/* Tracked links list */}
      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Tracked videos
          {filterPlatform !== 'all' && (
            <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>· {PLATFORM_LABEL[filterPlatform] ?? filterPlatform} only</span>
          )}
        </h2>
        {visibleLinks.length === 0 ? (
          <div className="card text-center py-12">
            <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No videos tracked yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Paste a YouTube or Vimeo link to see all-time stats here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visibleLinks.map((link) => (
              <LinkCard key={link.id} link={link} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TotalCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  subValue?: string
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <p className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{value}</p>
      {subValue && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{subValue}</p>}
    </div>
  )
}

function AddLinkForm({
  clients,
  jobs,
  onDone,
}: {
  clients: ClientOption[]
  jobs: ClientOption[]
  onDone: () => void
}) {
  const [state, action, pending] = useActionState(trackSocialLink, undefined)
  const [url, setUrl] = useState('')

  if (state?.success) {
    // Close on success — the server-action's revalidatePath rehydrates the list.
    setTimeout(onDone, 0)
  }

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label mb-2 block">Video URL</label>
        <input
          name="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..."
          className="field-input w-full text-sm"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label mb-2 block">Link to client (optional)</label>
          <select name="clientId" className="field-input w-full text-sm">
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-2 block">Link to job (optional)</label>
          <select name="jobId" className="field-input w-full text-sm">
            <option value="">— None —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label mb-2 block">Notes (optional)</label>
        <input
          name="notes"
          className="field-input w-full text-sm"
          placeholder="e.g. Brand launch teaser"
        />
      </div>
      {state?.error && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>{state.error}</p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !url.trim()} className="btn-primary text-sm">
          {pending ? 'Fetching stats...' : 'Track this video'}
        </button>
        <button type="button" onClick={onDone} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  )
}

function LinkCard({ link }: { link: SocialLink }) {
  const [pending, startTransition] = useTransition()

  function handleRefresh() {
    startTransition(async () => {
      await refreshSocialLink(link.id)
    })
  }

  function handleDelete() {
    if (!confirm(`Stop tracking "${link.title || link.url}"?`)) return
    startTransition(async () => {
      await deleteSocialLink(link.id)
    })
  }

  const duration = formatDuration(link.durationSeconds)

  return (
    <div className="card flex flex-col gap-3" style={{ opacity: pending ? 0.6 : 1, transition: 'opacity 150ms' }}>
      <div className="flex gap-3">
        {link.thumbnailUrl ? (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative shrink-0 rounded-lg overflow-hidden"
            style={{ width: 120, height: 68, background: 'var(--bg-elevated)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={link.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {duration && (
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] font-medium rounded" style={{ background: 'rgba(0,0,0,0.75)', color: '#fff' }}>{duration}</span>
            )}
          </a>
        ) : (
          <div
            className="shrink-0 rounded-lg flex items-center justify-center"
            style={{ width: 120, height: 68, background: 'var(--bg-elevated)' }}
          >
            <PlatformIcon platform={link.platform} className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <PlatformIcon platform={link.platform} className="w-3.5 h-3.5" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {PLATFORM_LABEL[link.platform] ?? link.platform}
            </span>
            {link.channel && (
              <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>· {link.channel}</span>
            )}
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold hover:underline block truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {link.title || link.url}
          </a>
          {(link.clientName || link.jobName) && (
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--accent)' }}>
              {[link.clientName, link.jobName].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={Eye} label="Views" value={link.views} />
        <Stat icon={Heart} label="Likes" value={link.likes} />
        <Stat icon={MessageSquare} label="Comments" value={link.comments} />
      </div>

      {link.syncError && (
        <div className="rounded-md p-2 flex items-start gap-2" style={{ background: 'var(--bg-elevated)' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{link.syncError}</p>
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto">
        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
          <Clock className="w-3 h-3" /> Synced {relativeTime(link.lastSyncedAt)}
        </span>
        <div className="ml-auto flex gap-1.5">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn-icon" title="Open">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={handleRefresh} disabled={pending} className="btn-icon" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${pending ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleDelete} disabled={pending} className="btn-icon" title="Delete" style={{ color: 'var(--danger)' }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: number }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-elevated)' }}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{compactNumber(value)}</p>
    </div>
  )
}

function ConnectedAccounts({ accounts }: { accounts: ConnectedAccount[] }) {
  const [pending, startTransition] = useTransition()
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const igAccount = accounts.find((a) => a.platform === 'instagram')
  const fbAccount = accounts.find((a) => a.platform === 'facebook')
  const ttAccount = accounts.find((a) => a.platform === 'tiktok')

  function handleSyncIg() {
    setSyncMsg(null)
    startTransition(async () => {
      const result = await syncInstagramAccounts()
      if (result.error) setSyncMsg(result.error)
      else setSyncMsg(`Synced ${result.ok} account${result.ok === 1 ? '' : 's'}${result.failed ? ` · ${result.failed} failed` : ''}.`)
    })
  }

  function handleDisconnect(id: string) {
    if (!confirm('Disconnect this account? Stored posts will stay but stats will stop refreshing.')) return
    startTransition(async () => {
      await disconnectAccount(id)
    })
  }

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Connected accounts</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        Connect a platform to pull your channel-level posts and stats automatically. Public YouTube / Vimeo links don&apos;t need a connection — just paste them above.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AccountCard
          platform="instagram"
          label="Instagram"
          subline={igAccount ? `@${igAccount.accountName ?? '—'}` : 'Business or Creator account required'}
          connected={!!igAccount}
          actions={
            igAccount ? (
              <div className="flex gap-1.5">
                <button onClick={handleSyncIg} disabled={pending} className="btn-secondary text-xs" style={{ padding: '4px 8px' }}>
                  <RefreshCw className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`} />
                  Sync
                </button>
                <button onClick={() => handleDisconnect(igAccount.id)} disabled={pending} className="btn-icon" style={{ color: 'var(--danger)' }} title="Disconnect">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <a href="/api/auth/instagram/start" className="btn-primary text-xs" style={{ padding: '4px 10px' }}>Connect</a>
            )
          }
        />
        <AccountCard
          platform="facebook"
          label="Facebook"
          subline={fbAccount ? fbAccount.accountName ?? '—' : 'Connect via Instagram (uses Page)'}
          connected={!!fbAccount}
          comingSoon
        />
        <AccountCard
          platform="tiktok"
          label="TikTok"
          subline={ttAccount ? ttAccount.accountName ?? '—' : 'TikTok Business approval required'}
          connected={!!ttAccount}
          comingSoon
        />
      </div>

      {syncMsg && (
        <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>{syncMsg}</p>
      )}
    </div>
  )
}

function AccountCard({
  platform,
  label,
  subline,
  connected,
  comingSoon,
  actions,
}: {
  platform: string
  label: string
  subline: string
  connected: boolean
  comingSoon?: boolean
  actions?: React.ReactNode
}) {
  return (
    <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'var(--bg-elevated)' }}>
      <PlatformIcon platform={platform} className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: connected ? 'var(--accent)' : 'var(--text-tertiary)' }}>{subline}</p>
      </div>
      {actions ? actions : comingSoon ? <span className="badge badge-muted shrink-0">Soon</span> : null}
    </div>
  )
}
