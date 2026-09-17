/**
 * The standing monthly bills, in the order they are about to be charged.
 *
 * These never appear in the Money panel above it in a useful shape — Xero
 * gives a single Expenses bar for the month, which tells you what went out
 * but not what is about to. This is the other half of that question: six
 * fixed subscriptions that leave the account whether or not anyone looks,
 * and the only thing worth knowing about them at a glance is which one is
 * next and what the monthly floor comes to.
 *
 * The list is hard-coded on purpose. These are Arlo's own subscriptions, not
 * rows in the CRM — there is no table behind them, nothing creates or edits
 * one, and putting six literals here is honest about that. When they start
 * changing often enough to be annoying, that is the signal to give them a
 * table, not before.
 *
 * Renewal day only, not a stored next-charge date: a date in a constant goes
 * stale the moment it passes, and every one of these repeats on the same day
 * of the month. The date shown is computed from today each render (the page
 * is force-dynamic), so it is never behind.
 */

const NZ_TZ = 'Pacific/Auckland'

type Subscription = {
  name: string
  /** NZD per month. Null when the charge does not come off Arlo's card. */
  amount: number | null
  /** Day of the month it renews. Clamped to the month's length. */
  day: number
  /** Short muted qualifier shown under the name, where there is one. */
  note?: string
}

// Amounts are NZD, as charged.
const SUBSCRIPTIONS: Subscription[] = [
  { name: 'Anthropic (Claude)', amount: 40.74, day: 5 },
  { name: 'iCloud+', amount: 6.10, day: 8 },
  { name: 'Xero', amount: null, day: 13, note: 'Billed through WK Strawbridge' },
  { name: 'Google One', amount: 3.49, day: 16 },
  { name: 'Meta Verified (Instagram)', amount: 19.34, day: 26 },
  { name: 'ChatGPT', amount: 14.25, day: 28 },
]

function nzToday(now: Date): { year: number; month: number; date: number } {
  // Same trick as lib/attention.ts: re-read the instant in NZ and take the
  // calendar fields off it, so a server running in UTC still rolls the day
  // over at NZ midnight rather than thirteen hours late.
  const nz = new Date(now.toLocaleString('en-US', { timeZone: NZ_TZ }))
  return { year: nz.getFullYear(), month: nz.getMonth(), date: nz.getDate() }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** The next time `day` comes around, today included. */
function nextCharge(day: number, today: ReturnType<typeof nzToday>): Date {
  const thisMonth = Math.min(day, daysInMonth(today.year, today.month))
  if (thisMonth >= today.date) return new Date(today.year, today.month, thisMonth)
  const m = today.month + 1
  return new Date(today.year, m, Math.min(day, daysInMonth(today.year, m)))
}

function daysUntil(when: Date, today: ReturnType<typeof nzToday>): number {
  const from = Date.UTC(today.year, today.month, today.date)
  const to = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate())
  return Math.round((to - from) / 86_400_000)
}

function whenLabel(when: Date, away: number): string {
  if (away === 0) return 'Today'
  if (away === 1) return 'Tomorrow'
  const date = when.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
  return `${date} · ${away} days`
}

const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

export default function SubscriptionsPanel() {
  const today = nzToday(new Date())

  const rows = SUBSCRIPTIONS.map((sub) => {
    const when = nextCharge(sub.day, today)
    const away = daysUntil(when, today)
    return { ...sub, when, away }
  }).sort((a, b) => a.away - b.away)

  // Xero has no amount here because it is not charged to the card, so it is
  // out of the total rather than counted as zero — and the footnote says so,
  // otherwise a monthly figure that quietly omits a bill is worse than none.
  const monthly = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)

  return (
    <section>
      <div className="section-head">
        <h2 className="section-heading">Subscriptions</h2>
        <span className="section-head-meta">{nzd.format(monthly)}/mo</span>
      </div>

      <div className="card-flush">
        {rows.map((row) => (
          <div key={row.name} className="sub-row">
            <div className="sub-body">
              <span className="sub-name">{row.name}</span>
              <span className="sub-meta">
                {whenLabel(row.when, row.away)}
                {row.note ? ` · ${row.note}` : ''}
              </span>
            </div>
            <span className={`sub-amount${row.amount === null ? ' sub-amount-none' : ''}`}>
              {row.amount === null ? '—' : nzd.format(row.amount)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
        NZD, renewing monthly. The total leaves out Xero, which is billed
        through WK Strawbridge rather than off the card.
      </p>
    </section>
  )
}
