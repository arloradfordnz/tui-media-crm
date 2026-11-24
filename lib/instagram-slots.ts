// Tui Media's own Instagram: two posts a week, Tuesday and Friday.
//
// Agreed on 15 November 2026. There is no Instagram connection, so a post is
// logged by hand ("Posted it" on Today) into social_posts. The slots are not
// stored: they are worked out per week, shown on the calendar as read-only
// entries, and a slot counts as done when that week has at least as many
// posts as slots up to and including it. So posting twice on Monday covers
// the week, and a post on Wednesday covers Tuesday.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** 0 = Sunday. Tuesday and Friday. */
export const SLOT_WEEKDAYS = [2, 5]
export const POSTS_PER_WEEK = SLOT_WEEKDAYS.length

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/** Monday of the week a day falls in. */
export function weekStart(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7))
}

export type Slot = { date: string; dayName: string; index: number; covered: boolean }

export function slotsForWeek(monday: string, postsThatWeek: number): Slot[] {
  return SLOT_WEEKDAYS.map((wd, index) => {
    const date = addDays(monday, (wd + 6) % 7)
    return { date, dayName: DAY_NAMES[wd], index, covered: postsThatWeek > index }
  })
}

/** Posts per week (keyed by Monday) between two days, inclusive. */
export async function postsByWeek(db: Db, from: string, to: string): Promise<Map<string, number>> {
  const { data, error } = await db.from('social_posts').select('posted_on').gte('posted_on', from).lte('posted_on', to)
  // Throw rather than read a missing table as "no posts", which would flag
  // every slot as missed before the migration has run.
  if (error) throw new Error(error.message)
  const counts = new Map<string, number>()
  for (const r of (data ?? []) as { posted_on: string }[]) {
    const w = weekStart(r.posted_on)
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return counts
}

/** Calendar entries for every slot between two days. */
export async function slotEvents(db: Db, from: string, to: string) {
  const counts = await postsByWeek(db, weekStart(from), addDays(weekStart(to), 6))
  const out: { id: string; title: string; date: string; covered: boolean }[] = []
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
    for (const s of slotsForWeek(w, counts.get(w) ?? 0)) {
      if (s.date < from || s.date > to) continue
      out.push({ id: `post:${s.date}`, title: s.covered ? 'Instagram post (posted)' : 'Instagram post', date: s.date, covered: s.covered })
    }
  }
  return out
}
