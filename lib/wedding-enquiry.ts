// Wedding enquiries from the arloradford.nz form, filed into the CRM.
//
// The form asks for names, email, a free-text date ("14 February 2027"),
// where, which package and anything else. The playbook says to reply the same
// day with a price and two times to meet, so this does the legwork up front:
// it parses the date, checks the calendar for that day, and drafts the reply.
// Today then shows one row with a Reply link that opens the draft in Mail.
//
// Prices come from Tui_Media_Playbook.md ("Arlo Radford" table). Change them
// there and here together.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function valid(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d
}

/**
 * The form's date, as YYYY-MM-DD, or null when it isn't one day ("sometime in
 * March", "not set yet"). Reads "14 February 2027", "Feb 14 2027", "14/2/2027"
 * (NZ order, day first) and "2027-02-14". A date with no year is taken as the
 * next time that day comes round.
 */
export function parseEnquiryDate(raw: string | null | undefined, today = new Date()): string | null {
  const text = String(raw ?? '').toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').trim()
  if (!text) return null

  let m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (m) {
    const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]]
    return valid(y, mo, d) ? iso(y, mo, d) : null
  }

  m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/)
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]
    const [mo, d] = [+m[2] - 1, +m[1]]
    return valid(y, mo, d) ? iso(y, mo, d) : null
  }

  // "14 february 2027" or "february 14 2027", year optional.
  const word = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
  m = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${word})\\b(?:\\s+(\\d{4}))?`)) ??
    text.match(new RegExp(`\\b(${word})\\s+(\\d{1,2})\\b(?:\\s+(\\d{4}))?`))
  if (!m) return null
  const dayFirst = /^\d/.test(m[1])
  const d = +(dayFirst ? m[1] : m[2])
  const mo = MONTHS[dayFirst ? m[2] : m[1]]
  let y = m[3] ? +m[3] : today.getFullYear()
  if (!m[3] && iso(y, mo, d) < today.toISOString().slice(0, 10)) y++
  return valid(y, mo, d) ? iso(y, mo, d) : null
}

/** "Saturday 14 February 2027" */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).replace(',', '')
}

/** The NZ calendar day of a stored timestamp. Date-only rows are saved as UTC
 *  midnight, so those are read as UTC; anything with a time is read in NZ. */
function nzDay(stamp: string): string {
  if (/T00:00:00(\.0+)?(\+00:00|Z)$/.test(stamp)) return stamp.slice(0, 10)
  return new Date(stamp).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
}

export type DateCheck =
  | { state: 'free' }
  | { state: 'booked'; what: string }   // a shoot or booked job that day
  | { state: 'busy'; what: string }     // something else in the calendar
  | { state: 'unknown' }                // no single date to check

export async function checkDate(db: Db, isoDate: string | null): Promise<DateCheck> {
  if (!isoDate) return { state: 'unknown' }
  // A day either side, then narrowed to the NZ day, because stored times are
  // a mix of UTC midnights and real times.
  const from = new Date(Date.parse(`${isoDate}T00:00:00Z`) - 86400000).toISOString()
  const to = new Date(Date.parse(`${isoDate}T00:00:00Z`) + 2 * 86400000).toISOString()
  const [eventsRes, jobsRes] = await Promise.all([
    db.from('events').select('title, event_type, date').gte('date', from).lt('date', to),
    db.from('jobs').select('name, status, shoot_date').gte('shoot_date', from).lt('shoot_date', to)
      .not('status', 'in', '("enquiry","archived")'),
  ])
  const events = ((eventsRes.data ?? []) as { title: string; event_type: string; date: string }[])
    .filter((e) => nzDay(e.date) === isoDate)
  const jobs = ((jobsRes.data ?? []) as { name: string; shoot_date: string }[])
    .filter((j) => nzDay(j.shoot_date) === isoDate)

  if (jobs.length > 0) return { state: 'booked', what: jobs[0].name }
  const shoot = events.find((e) => e.event_type === 'shoot')
  if (shoot) return { state: 'booked', what: shoot.title }
  if (events.length > 0) return { state: 'busy', what: events[0].title }
  return { state: 'free' }
}

/** Two after-school slots in the next week: weekdays at 4pm, skipping days
 *  that already have something in the calendar. */
async function meetingTimes(db: Db, now: Date): Promise<string[]> {
  const nz = new Date(now.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }))
  const days: string[] = []
  for (let i = 1; days.length < 8 && i < 14; i++) {
    const d = new Date(Date.UTC(nz.getFullYear(), nz.getMonth(), nz.getDate() + i))
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5) days.push(d.toISOString().slice(0, 10))
  }
  const { data } = await db.from('events').select('date').gte('date', `${days[0]}T00:00:00Z`).lte('date', `${days[days.length - 1]}T23:59:59Z`)
  const taken = new Set(((data ?? []) as { date: string }[]).map((e) => nzDay(e.date)))
  return days.filter((d) => !taken.has(d)).slice(0, 2).map((d) => {
    const [y, m, day] = d.split('-').map(Number)
    const label = new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '')
    return `${label} at 4pm`
  })
}

const PACKAGES: { key: string; line: string }[] = [
  { key: 'elopement', line: 'Elopement, from $1,200: a small ceremony and one short film' },
  { key: 'full day', line: 'Full day, from $2,200: getting ready through to the first dance, your film, a teaser and the full ceremony' },
  { key: 'full day plus', line: 'Full day plus, from $2,900: everything in the full day, plus a second camera and your speeches edited' },
]

export type WeddingReply = { subject: string; body: string }

/**
 * The reply, in Arlo's voice: warm and casual, plain words, no em dashes.
 * It is a draft. Arlo reads it in Mail before anything is sent.
 */
export async function draftWeddingReply(db: Db, input: {
  names: string
  rawDate: string
  isoDate: string | null
  place: string | null
  pkg: string | null
  check: DateCheck
  now?: Date
}): Promise<WeddingReply> {
  const times = await meetingTimes(db, input.now ?? new Date())
  const when = input.isoDate ? longDate(input.isoDate) : input.rawDate
  const at = input.place ? ` at ${input.place}` : ''

  const dateLine =
    input.check.state === 'free' ? `Good news, I'm free on ${when}${at}.`
    : input.check.state === 'booked' ? `I'm really sorry, I'm already booked to film on ${when}. If your date moves at all, let me know and I'll check again.`
    : input.check.state === 'busy' ? `I've got something else on ${when}, so let me double check I can make it work and I'll confirm.`
    : `Could you send me the exact date when you have it? Then I can check I'm free.`

  const chosen = (input.pkg ?? '').toLowerCase().trim()
  const pick = PACKAGES.find((p) => p.key === chosen)
  const lines = [
    `Kia ora ${input.names},`,
    '',
    `Thanks so much for getting in touch, and congrats! ${dateLine}`,
  ]
  if (input.check.state !== 'booked') {
    lines.push(
      '',
      'Here is how my wedding films work:',
      ...PACKAGES.map((p) => `- ${p.line}`),
      '',
      pick ? `You mentioned the ${pick.key}, so that's the one I'd point you to. ` + '$500 holds your date and the rest is due after the wedding.'
        : '$500 holds your date and the rest is due after the wedding.',
    )
    if (times.length === 2) {
      lines.push('', `Keen to have a quick chat about your day? I could do ${times[0]} or ${times[1]}, in person or on a call, whatever's easiest.`)
    } else {
      lines.push('', `Keen to have a quick chat about your day? Let me know a time that suits after 3:30 on a weekday, in person or on a call.`)
    }
  }
  lines.push('', 'Cheers,', 'Arlo')

  return {
    subject: input.isoDate ? `Your wedding on ${longDate(input.isoDate)}` : 'Your wedding film',
    body: lines.join('\n'),
  }
}

/** mailto: link with the reply prefilled. */
export function replyMailto(email: string, reply: WeddingReply): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(reply.subject)}&body=${encodeURIComponent(reply.body)}`
}
