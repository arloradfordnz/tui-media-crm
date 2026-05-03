import { Heart, Sparkles, Plug, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase'
import { timeAgo } from '@/lib/format'

type Report = {
  id: string
  generated_at: string
  score: number | null
  headline: string | null
  summary: string
  signals: Record<string, unknown>
}

const SOURCES = [
  { key: 'xero', label: 'Xero', href: '/dashboard/finance' },
  { key: 'instagram', label: 'Instagram', href: '/dashboard/settings#integrations' },
] as const

function HealthScoreRing({ score }: { score: number | null }) {
  const size = 96
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score))
  const dash = (pct / 100) * circumference
  const colour = score == null
    ? 'var(--text-tertiary)'
    : score >= 75 ? 'var(--success)'
    : score >= 50 ? 'var(--accent)'
    : score >= 30 ? 'var(--warning)'
    : 'var(--danger)'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colour} strokeWidth={stroke} strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {score == null ? '—' : score}
        </span>
        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Score</span>
      </div>
    </div>
  )
}

function SignalChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}
    >
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
    </div>
  )
}

function nzd(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return `$${Math.round(n)}`
}

export default async function BusinessHealth() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('business_health_reports')
    .select('id, generated_at, score, headline, summary, signals')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const report = (data ?? null) as Report | null
  const signals = (report?.signals ?? {}) as Record<string, number | Record<string, { connected?: boolean }>>
  type XeroIntegration = {
    connected?: boolean
    org_name?: string | null
    revenue_this_month_nzd?: number | null
    net_profit_this_month_nzd?: number | null
    outstanding_invoices_nzd?: number
    overdue_invoices_nzd?: number
    bank_balance_nzd?: number | null
  }
  const integrations = (signals.integrations ?? {}) as Record<string, XeroIntegration>
  const xero = integrations.xero ?? { connected: false }
  const connectedCount = SOURCES.filter((s) => integrations[s.key]?.connected).length
  const disconnected = SOURCES.filter((s) => !integrations[s.key]?.connected)

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Business Health</h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <RefreshCw className="w-3 h-3" />
          {report ? `Updated ${timeAgo(report.generated_at)}` : 'Awaiting first run'}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 items-start mb-5">
        <HealthScoreRing score={report?.score ?? null} />
        <div className="flex-1 min-w-0">
          {report ? (
            <>
              {report.headline && (
                <p className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  {report.headline}
                </p>
              )}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {report.summary}
              </p>
              <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                <Sparkles className="w-3 h-3" />
                AI-generated daily at midnight from your CRM data and connected sources.
              </div>
            </>
          ) : (
            <>
              <p className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                No report yet
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                The first daily review will run tonight at midnight. Once integrations are connected, the AI will weigh social engagement, Google reviews and Xero financials alongside your CRM activity.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Signal chips — only the headline numbers. Detailed breakdowns
          (engagement, comments, total reviews, etc.) live on dedicated pages. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <SignalChip
          label="Revenue MTD"
          value={nzd(xero.connected ? xero.revenue_this_month_nzd ?? null : (signals.revenue_this_month_nzd as number))}
        />
        <SignalChip label="Pipeline value" value={nzd(signals.pipeline_value_nzd as number)} />
        <SignalChip label="Active jobs" value={String((signals.active_jobs as number) ?? '—')} />
        <SignalChip label="Leads" value={String((signals.leads_in_pipeline as number) ?? '—')} />
        {xero.connected && (
          <>
            <SignalChip label="Net profit MTD" value={nzd(xero.net_profit_this_month_nzd ?? null)} />
            <SignalChip label="Bank balance" value={nzd(xero.bank_balance_nzd ?? null)} />
            <SignalChip label="Overdue" value={nzd(xero.overdue_invoices_nzd ?? 0)} />
          </>
        )}
      </div>

      {/* Integration status strip */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 text-xs"
        style={{ borderTop: '1px solid var(--bg-border)', color: 'var(--text-tertiary)' }}
      >
        <span>{connectedCount} of {SOURCES.length} sources connected</span>
        {disconnected.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            {disconnected.map((s, i) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                <Link href={s.href} className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <Plug className="w-3 h-3" /> {s.label}
                </Link>
                {i < disconnected.length - 1 && <span style={{ color: 'var(--text-tertiary)' }}>·</span>}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
