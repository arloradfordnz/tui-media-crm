/**
 * The standing monthly bills, in the order they are about to be charged.
 *
 * These never appear in the Money panel in a useful shape — Xero gives a
 * single Expenses bar for the month, which tells you what went out but not
 * what is about to. This is the other half of that question: the fixed
 * subscriptions that leave the account whether or not anyone looks, and the
 * only thing worth knowing about them at a glance is which one is next and
 * what the monthly floor comes to.
 *
 * They live in the `subscriptions` table (20261011_0001) so Tui can add,
 * change and cancel them. They were hard-coded until that was wanted.
 *
 * Renewal day only, not a stored next-charge date: a stored date goes stale
 * the moment it passes, and every one of these repeats on the same day of the
 * month. The date shown is computed from today each render (the page is
 * force-dynamic), so it is never behind.
 */

const NZ_TZ = 'Pacific/Auckland'

export type Subscription = {
  id: string
  name: string
  /** NZD per period: per month, or per year when period is 'year'. */
  amount: number
  period: 'month' | 'year'
  /** Day of the month it renews. Clamped to the month's length. Null on a yearly one with no date yet. */
  day: number | null
  /** Month it renews (1 to 12). Yearly ones only. */
  renewMonth: number | null
  /** Short muted qualifier shown under the name, where there is one. */
  note: string | null
}

// Fetched by the page inside its one parallel wave rather than here, so the
// panel costs no extra sequential round trip (see AGENTS.md on counting them).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSubscriptions(supabase: any): Promise<Subscription[] | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, name, amount, period, day, renew_month, note')
    .eq('active', true)
  if (error) return null
  // numeric arrives as a string from PostgREST.
  return (data ?? []).map((r: { id: string; name: string; amount: unknown; period: 'month' | 'year'; day: number | null; renew_month: number | null; note: string | null }) => ({
    id: r.id, name: r.name, amount: Number(r.amount), period: r.period, day: r.day, renewMonth: r.renew_month, note: r.note,
  }))
}

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

/** The next 1 January-style anniversary: the next time `day` of `month` comes around, today included. */
function nextYearly(day: number, month: number, today: ReturnType<typeof nzToday>): Date {
  const on = (year: number) => new Date(year, month - 1, Math.min(day, daysInMonth(year, month - 1)))
  const thisYear = on(today.year)
  return thisYear.getTime() >= new Date(today.year, today.month, today.date).getTime() ? thisYear : on(today.year + 1)
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

export default function SubscriptionsPanel({ subscriptions }: { subscriptions: Subscription[] | null }) {
  const today = nzToday(new Date())

  if (!subscriptions) {
    return (
      <section className="today-subs">
        <div className="section-head"><h2 className="section-heading">Subscriptions</h2></div>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Couldn&apos;t load subscriptions just now.</p>
      </section>
    )
  }

  const rows = subscriptions.map((sub) => {
    // A yearly one added before its renewal date is known has none to show.
    const when = sub.period === 'year'
      ? (sub.day && sub.renewMonth ? nextYearly(sub.day, sub.renewMonth, today) : null)
      : nextCharge(sub.day ?? 1, today)
    const away = when ? daysUntil(when, today) : Infinity
    return { ...sub, when, away }
  }).sort((a, b) => (a.away === b.away ? 0 : a.away < b.away ? -1 : 1))

  // Every subscription counts toward this, Xero included — it goes out through
  // WK Strawbridge rather than off the card, but it is still money leaving
  // monthly, and a total that quietly omitted one would be worse than none.
  // A yearly one counts at a twelfth, so the monthly figure is what it costs a
  // month on average rather than a spike in the month it renews.
  const monthly = rows.reduce((sum, r) => sum + (r.period === 'year' ? r.amount / 12 : r.amount), 0)
  const hasYearly = rows.some((r) => r.period === 'year')

  return (
    <section className="today-subs">
      <div className="section-head">
        <h2 className="section-heading">Subscriptions</h2>
        <span className="section-head-meta">{nzd.format(monthly)}/mo</span>
      </div>

      {rows.length === 0 ? (
        <div className="today-empty">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No subscriptions. Ask Tui to add one.</p>
        </div>
      ) : (
      <div className="card-flush">
        {rows.map((row) => (
          <div key={row.id} className="sub-row">
            <div className="sub-body">
              <span className="sub-name">{row.name}</span>
              <span className="sub-meta">
                {row.when ? whenLabel(row.when, row.away) : 'Renewal date not set'}
                {row.note ? ` · ${row.note}` : ''}
              </span>
            </div>
            <span className="sub-amount">{nzd.format(row.amount)}<small className="sub-per">{row.period === 'year' ? '/yr' : '/mo'}</small></span>
          </div>
        ))}
      </div>
      )}

      <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
        NZD{hasYearly ? '. Yearly ones count at a twelfth in the monthly total' : ''}. Ask Tui to add, change or cancel one.
      </p>
    </section>
  )
}
