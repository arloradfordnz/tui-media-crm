import { createServerSupabaseClient } from '@/lib/supabase'
import { getAttention, type AttentionItem } from '@/lib/attention'
import { ArrowUpRight, Camera, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import ButtonArrow from '@/components/ButtonArrow'
import Greeting from './Greeting'
import TuiPanel from './TuiPanel'

export const dynamic = 'force-dynamic'

// The home screen answers "what do I do now", not "how is the business doing".
//
// It used to be four KPI cards and a twelve-month revenue chart — the most
// generic SaaS home screen there is, and for a business this size two of those
// KPIs barely move week to week. Worse, it blocked first paint on an untimed,
// cold-start-uncached Xero chain, so the page you open most often was gated on
// the slowest thing in the app.
//
// Revenue is a monthly artefact. It now costs a click (/dashboard/insights)
// instead of a scroll, and nothing on this page touches Xero at all.

// Six is the cap on purpose: a list you can actually finish. Everything past
// it lives on the surface that owns it.
const MAX_ITEMS = 6

function timeLabel(start: string | null, end: string | null): string {
  if (!start) return 'All day'
  return end ? `${start} – ${end}` : start
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const [attention, { data: tuiThread }] = await Promise.all([
    getAttention(supabase, new Date()),
    supabase
      .from('sms_messages')
      .select('direction, body, created_at')
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  const { todayLabel, todayEvents, items } = attention
  const shown = items.slice(0, MAX_ITEMS)
  const remaining = items.length - shown.length

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 4, alignItems: 'flex-end' }}>
        <div className="page-header-left">
          <h1
            style={{
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            <Greeting />
          </h1>
          <p className="page-subtitle" style={{ marginTop: 8 }}>{todayLabel}</p>
        </div>
        <div className="page-header-actions">
          <Link href="/dashboard/insights" className="btn-ghost btn-ghost-accent">
            Revenue <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <Link href="/dashboard/clients/new" className="btn-secondary">
            New Client <ButtonArrow />
          </Link>
          <Link href="/dashboard/jobs/new" className="btn-primary">
            New Job <ButtonArrow />
          </Link>
        </div>
      </div>

      {/* ── Today ─────────────────────────────────────────────
          Time-ordered, or an honest empty state that points at the
          next most useful thing rather than saying "nothing". */}
      <section>
        <h2 className="section-heading">Today</h2>
        {todayEvents.length === 0 ? (
          <div className="today-empty">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {items.length === 0
                ? 'Nothing booked, and nothing needs you. Genuinely clear.'
                : `No shoot today — ${items.length} thing${items.length === 1 ? '' : 's'} below need${items.length === 1 ? 's' : ''} you.`}
            </p>
          </div>
        ) : (
          <div className="card-flush">
            {todayEvents.map((e) => (
              <div key={e.id} className="today-row">
                <span className="today-time">{timeLabel(e.startTime, e.endTime)}</span>
                <Camera
                  className="w-4 h-4 shrink-0"
                  style={{ color: e.eventType === 'shoot' ? 'var(--accent)' : 'var(--text-tertiary)' }}
                />
                <div className="today-body">
                  <span className="today-title">{e.title}</span>
                  {e.job && (
                    <Link href={`/dashboard/jobs/${e.job.id}`} className="today-job">
                      {e.job.name}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Needs you ─────────────────────────────────────────
          One sentence and one action per item. Same model the
          assistant reads (lib/attention.ts). */}
      <section>
        <div className="flex items-center justify-between pb-1">
          <h2 className="section-heading" style={{ marginBottom: 0 }}>Needs you</h2>
          {remaining > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              +{remaining} more
            </span>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="today-empty">
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nothing overdue, stalled or waiting on a reply.
            </p>
          </div>
        ) : (
          <div className="card-flush">
            {shown.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* ── Tui ───────────────────────────────────────────────
          Same thread as Telegram; picks up where the last text left off. */}
      <section>
        <div className="flex items-center justify-between pb-1">
          <h2 className="section-heading" style={{ marginBottom: 0 }}>Tui</h2>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            One thread with Telegram
          </span>
        </div>
        <TuiPanel
          initialThread={(
            (tuiThread ?? []) as { direction: 'inbound' | 'outbound'; body: string; created_at: string }[]
          )
            .slice()
            .reverse()}
        />
      </section>
    </div>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <div className="attention-row">
      <span className={`attention-dot attention-${item.severity}`} aria-hidden="true" />
      <div className="attention-body">
        <span className="attention-sentence">{item.sentence}</span>
        {item.meta && <span className="attention-meta">{item.meta}</span>}
      </div>
      <Link href={item.action.href} className="btn-ghost attention-action">
        {item.action.label}
      </Link>
    </div>
  )
}
