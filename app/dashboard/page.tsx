import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAttention, type AttentionItem, type WeekEvent } from '@/lib/attention'
import { CheckCircle2, Plus, UserPlus } from 'lucide-react'
import Link from 'next/link'
import Greeting from './Greeting'
import MoneyPanel, { MoneyPanelSkeleton } from './MoneyPanel'
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
// Revenue still lives on Finance, which is the page that owns it — the range
// control, the focus toggle, the table, the transactions. What comes back here
// is a read-only six-month graph of in against out, and it is STREAMED inside
// a <Suspense> rather than awaited, so the Xero chain can be as slow as it
// likes without the page waiting on it. Nothing above the chart touches Xero,
// which is why this page still paints immediately.

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

      {/* ── One column you type into, one column you read ─────
          Tui is the only thing on this page you put a cursor into, so it gets
          the whole left side and the full height of the screen — a chat panel
          that ends halfway down the page is a chat panel you stop using.

          Everything on the right is read-only and ordered by how soon it
          changes what you do: what is booked this week, what is waiting on
          you, then the money, which moves monthly and is the thing you check
          rather than act on. They collapse to one column below 1100px, where
          side by side would leave the chat too narrow to hold a sentence. */}
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
          <TuiThread variant="panel" ephemeral fill />
        </section>

        <div className="today-split-side dash-stack">
          {/* One list, not two.
              "This week" and "Needs you" were two panels answering the same
              question — what is on you — in two different visual languages,
              and a week with one shoot and one overdue invoice meant reading
              two near-empty cards to learn two facts. They are now one list in
              the Needs you treatment: what is booked first, because it is
              fixed and dated, then everything that needs a decision.

              The bookings keep the accent dot the calendar gives a shoot, so
              they are still distinguishable at a glance from something that
              has gone wrong. */}
          <section>
            <div className="section-head">
              <h2 className="section-heading">Needs you</h2>
              {remaining > 0 && (
                <span className="section-head-meta">+{remaining} more</span>
              )}
            </div>

            {weekEvents.length === 0 && shown.length === 0 ? (
              <div className="today-empty">
                <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Nothing booked this week, and nothing overdue or stalled. Genuinely clear.
                </p>
              </div>
            ) : (
              <div className="card-flush">
                {weekEvents.map((e) => (
                  <EventRow key={e.id} event={e} today={e.date === todayISO} />
                ))}
                {shown.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* Streamed, not awaited — see MoneyPanel. Last in the column
              because it is the slowest thing here and the least urgent: the
              list above it is already painted by the time it lands. */}
          <Suspense fallback={<MoneyPanelSkeleton />}>
            <MoneyPanel />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

// A booking, rendered as an attention row so the merged list reads as one
// thing. Deliberately the same markup as AttentionRow rather than a variant of
// the old today-row: sharing the class names is what makes the two kinds of
// item line up on the same grid instead of merely sitting in the same card.
function EventRow({ event, today }: { event: WeekEvent; today: boolean }) {
  const when = `${today ? 'Today' : weekdayShort(event.date)}${event.startTime ? `, ${timeLabel(event.startTime, event.endTime)}` : ''}`
  return (
    <div className="attention-row">
      {/* A shoot is the one booking worth picking out of the list by colour;
          anything else on the calendar takes the muted dot. */}
      <span
        className="attention-dot"
        style={{ background: event.eventType === 'shoot' ? 'var(--accent)' : 'var(--text-tertiary)' }}
        aria-hidden="true"
      />
      <div className="attention-body">
        <span className="attention-sentence">{event.title}</span>
        <span className="attention-meta">{event.job ? `${when} · ${event.job.name}` : when}</span>
      </div>
      <Link href={event.job ? `/dashboard/jobs/${event.job.id}` : '/dashboard/calendar'} className="btn-ghost attention-action">
        {event.job ? 'Open job' : 'Calendar'}
      </Link>
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
