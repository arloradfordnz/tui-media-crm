import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAttention, type AttentionItem } from '@/lib/attention'
import { Camera, CheckCircle2, Plus, UserPlus } from 'lucide-react'
import Link from 'next/link'
import Greeting from './Greeting'
import InboxPanel, { InboxPanelSkeleton } from './InboxPanel'
import TuiThread from '@/components/TuiThread'

export const dynamic = 'force-dynamic'

// The home screen answers "what do I do now", not "how is the business doing".
//
// It used to be four KPI cards and a twelve-month revenue chart — the most
// generic SaaS home screen there is, and for a business this size two of those
// KPIs barely move week to week. Worse, it blocked first paint on an untimed,
// cold-start-uncached Xero chain, so the page you open most often was gated on
// the slowest thing in the app.
//
// Revenue lives on Finance, which is the page for it. Nothing here touches
// Xero at all, which is why this page paints immediately.

// Six is the cap on purpose: a list you can actually finish. Everything past
// it lives on the surface that owns it.
const MAX_ITEMS = 6

function timeLabel(start: string | null, end: string | null): string {
  if (!start) return 'All day'
  return end ? `${start} – ${end}` : start
}

// e.date is already the NZ calendar day as YYYY-MM-DD (see lib/attention.ts),
// so this anchors it at UTC midnight and reads the weekday back out in UTC —
// the same trick the weekly briefing's own calendar strip uses in lib/email.ts.
// It never touches a real timezone conversion, so there is nothing for a
// server/browser offset to get wrong.
function weekdayShort(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', { timeZone: 'UTC', weekday: 'short' })
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  // The Tui panel below is deliberately not seeded from the shared thread, so
  // there is nothing else to fetch here.
  const attention = await getAttention(supabase, new Date())

  const { todayISO, todayLabel, weekEvents, items } = attention
  const shown = items.slice(0, MAX_ITEMS)
  const remaining = items.length - shown.length

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">
            <Greeting />
          </h1>
          <p className="page-subtitle" style={{ marginTop: 8 }}>{todayLabel}</p>
        </div>
        <div className="page-header-actions">
          <Link href="/dashboard/clients/new" className="btn-secondary">
            <UserPlus className="w-4 h-4" /> New Client
          </Link>
          <Link href="/dashboard/jobs/new" className="btn-primary">
            <Plus className="w-4 h-4" /> New Job
          </Link>
        </div>
      </div>

      {/* This week spans both columns.
          It used to show only today, which meant a booking-free today with a
          shoot booked for Thursday read as a completely empty banner — the
          single most common shape of a real week said nothing about it. */}
      {/* ── This week ─────────────────────────────────────────
          Time-ordered across the next 7 days, or an honest empty state that
          points at the next most useful thing rather than saying "nothing". */}
      <section>
        <h2 className="section-heading">This week</h2>
        {weekEvents.length === 0 ? (
          <div className="today-empty">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {items.length === 0
                ? 'Nothing booked this week, and nothing needs you. Genuinely clear.'
                : `Nothing booked this week — ${items.length} thing${items.length === 1 ? '' : 's'} below need${items.length === 1 ? 's' : ''} you.`}
            </p>
          </div>
        ) : (
          <div className="card-flush">
            {weekEvents.map((e) => (
              <div key={e.id} className="today-row">
                <span className="today-time">
                  <span className="today-day">{e.date === todayISO ? 'Today' : weekdayShort(e.date)}</span>
                  <span>{timeLabel(e.startTime, e.endTime)}</span>
                </span>
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

      {/* Two columns, and the conversation gets the left one.
          Tui is the thing you actually type into, so it takes the side the eye
          starts on and the taller half of the page; Needs you is a list you
          scan and click, which reads fine in a narrower column. They collapse
          to one below 1100px, where side by side would leave the chat too
          narrow to hold a sentence. */}
      <div className="today-split">
        {/* A scratch pad, not the Telegram thread.
            It used to open on the last twelve Telegram messages, which meant
            the dashboard's most prominent panel was usually showing the middle
            of a conversation from some other day, and anything typed here
            landed in Telegram. It now starts empty on every load and writes
            nothing to the shared thread — the continuous conversation lives on
            the Tui AI page and in ⌘K. */}
        <section className="today-split-main">
          <div className="section-head">
            <h2 className="section-heading">Tui AI</h2>
          </div>
          <TuiThread variant="panel" ephemeral />
        </section>

        {/* One sentence and one action per item. Same model the assistant
            reads (lib/attention.ts). */}
        <section className="today-split-side">
          <div className="section-head">
            <h2 className="section-heading">Needs you</h2>
            {remaining > 0 && (
              <span className="section-head-meta">+{remaining} more</span>
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

          {/* Streamed, not awaited. An IMAP login takes a second or two and
              nothing else on this page waits on anything remote. */}
          <Suspense fallback={<InboxPanelSkeleton />}>
            <InboxPanel />
          </Suspense>
        </section>
      </div>
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
