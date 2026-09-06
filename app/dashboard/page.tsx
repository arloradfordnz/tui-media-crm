import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAttention, type AttentionItem } from '@/lib/attention'
import { getTuiThread } from '@/lib/tui/thread'
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

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const [attention, tuiThread] = await Promise.all([
    getAttention(supabase, new Date()),
    getTuiThread(supabase),
  ])

  const { todayLabel, todayEvents, items } = attention
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

      {/* Today spans both columns: it is one line most days and reads as a
          banner rather than a panel. */}
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

      {/* Two columns, and the conversation gets the left one.
          Tui is the thing you actually type into, so it takes the side the eye
          starts on and the taller half of the page; Needs you is a list you
          scan and click, which reads fine in a narrower column. They collapse
          to one below 1100px, where side by side would leave the chat too
          narrow to hold a sentence. */}
      <div className="today-split">
        {/* Same thread as Telegram; picks up where the last text left off. */}
        <section className="today-split-main">
          <div className="flex items-center justify-between pb-1">
            <h2 className="section-heading" style={{ marginBottom: 0 }}>Tui</h2>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              One thread with Telegram
            </span>
          </div>
          <TuiThread initialThread={tuiThread} variant="panel" />
        </section>

        {/* One sentence and one action per item. Same model the assistant
            reads (lib/attention.ts). */}
        <section className="today-split-side">
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
