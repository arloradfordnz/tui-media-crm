// Retainer content backlog — how far behind Arlo actually is, measured by
// video files uploaded to the portal rather than by job status.
//
// Why not job status: statuses get set once and go stale, and the
// deliverables.completed flag isn't used at all in practice (every row is
// false, including on months that shipped in full). The only honest signal
// that a video exists is a delivery_files row hanging off its deliverable.
//
// The shape of retainer work: each retainer client gets one job per month,
// named with the month ("July Content", "Team Bainbridge — June Content").
// Its deliverables are that month's videos — four deliverables means four
// videos owed for that month. So:
//
//   expected videos for a month = deliverables on that month's job
//   delivered videos            = deliverables with at least one upload
//
// A month with no job at all is the worst case, not an absent one: it means
// the month was never even set up. Those are counted using the client's
// typical monthly volume so a missing July still reads as "3 videos owed"
// rather than silently scoring zero.

export type MonthStatus = {
  month: string          // '2026-07'
  label: string          // 'July 2026'
  jobId: string | null   // null when the month was never set up
  jobName: string | null
  expected: number
  uploaded: number
  missing: number
  jobExists: boolean
  isCurrentMonth: boolean
}

export type ClientBacklog = {
  clientId: string
  clientName: string
  monthlyRetainer: number | null
  typicalVideosPerMonth: number
  months: MonthStatus[]
  overdueMonths: number          // whole months past that still owe videos
  videosOwed: number             // videos owed across those past months
  monthsNeverStarted: number     // past months with no job at all
  currentMonth: MonthStatus | null
  lastUploadAt: string | null
}

export type ContentBacklog = {
  today: string
  current_month: string
  method: string
  clients: ClientBacklog[]
  totals: {
    videos_owed: number
    clients_behind: number
    months_never_started: number
  }
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]
const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']
const ABBR_INDEX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }

const MONTH_RE = new RegExp(`\\b(${[...MONTH_NAMES, ...MONTH_ABBR].join('|')})\\b`, 'i')

function monthKey(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`
}

function monthLabel(year: number, monthIdx: number): string {
  return `${MONTH_NAMES[monthIdx].charAt(0).toUpperCase()}${MONTH_NAMES[monthIdx].slice(1)} ${year}`
}

// Pull the month out of a job name. Job names carry a month but almost never a
// year, so the year is inferred from when the job was created: of the three
// candidate years, take whichever puts the month closest to the creation date.
// That way a January job created in late December lands in the new year rather
// than eleven months in the past.
export function parseJobMonth(name: string, createdAt: string | null): { year: number; monthIdx: number } | null {
  const match = MONTH_RE.exec(name)
  if (!match) return null

  const token = match[1].toLowerCase()
  const monthIdx = MONTH_NAMES.indexOf(token) >= 0 ? MONTH_NAMES.indexOf(token) : ABBR_INDEX[token] ?? -1
  if (monthIdx < 0) return null

  const created = createdAt ? new Date(createdAt) : new Date()
  const createdYear = created.getFullYear()
  let best = createdYear
  let bestDistance = Infinity
  for (const year of [createdYear - 1, createdYear, createdYear + 1]) {
    const distance = Math.abs(new Date(year, monthIdx, 15).getTime() - created.getTime())
    if (distance < bestDistance) { bestDistance = distance; best = year }
  }
  return { year: best, monthIdx: monthIdx }
}

type RawDeliverable = { id: string; delivery_files: { id: string; created_at: string }[] | null }
type RawJob = {
  id: string
  name: string
  created_at: string | null
  client_id: string
  deliverables: RawDeliverable[] | null
}
type RawClient = {
  id: string
  name: string
  monthly_retainer: number | null
  shoots_per_month: number | null
}

/**
 * Build the retainer content backlog from live CRM data.
 *
 * `now` is injectable so the caller controls the timezone reference — every
 * caller passes NZ wall-clock, because "is August late?" depends on the local
 * date, not UTC.
 */
export async function getContentBacklog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date = new Date()
): Promise<ContentBacklog> {
  const nzNow = new Date(now.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }))
  const currentYear = nzNow.getFullYear()
  const currentMonthIdx = nzNow.getMonth()
  const currentKey = monthKey(currentYear, currentMonthIdx)

  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, monthly_retainer, shoots_per_month')
    .eq('client_category', 'retainer')

  const clients = (clientRows ?? []) as RawClient[]
  if (clients.length === 0) {
    return {
      today: nzNow.toLocaleDateString('en-CA'),
      current_month: currentKey,
      method: 'Counted from videos actually uploaded to the portal.',
      clients: [],
      totals: { videos_owed: 0, clients_behind: 0, months_never_started: 0 },
    }
  }

  // One query for every retainer job and its uploads. Archived jobs are
  // included on purpose: an archived month still shipped its videos, and
  // dropping it would invent a hole in the history.
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id, name, created_at, client_id, deliverables(id, delivery_files(id, created_at))')
    .in('client_id', clients.map((c) => c.id))

  const jobs = (jobRows ?? []) as RawJob[]

  const result: ClientBacklog[] = []

  for (const client of clients) {
    const clientJobs = jobs.filter((j) => j.client_id === client.id)

    // Group month-named jobs by month. Two jobs for the same month merge —
    // their deliverables all count toward that month.
    const byMonth = new Map<string, { year: number; monthIdx: number; jobs: RawJob[] }>()
    for (const job of clientJobs) {
      const parsed = parseJobMonth(job.name, job.created_at)
      if (!parsed) continue
      const key = monthKey(parsed.year, parsed.monthIdx)
      const existing = byMonth.get(key)
      if (existing) existing.jobs.push(job)
      else byMonth.set(key, { year: parsed.year, monthIdx: parsed.monthIdx, jobs: [job] })
    }

    // No month-named jobs means there's no cadence to measure against. Say
    // nothing rather than inventing a backlog out of one-off project work.
    if (byMonth.size === 0) continue

    const countFor = (entry: { jobs: RawJob[] }) => {
      const deliverables = entry.jobs.flatMap((j) => j.deliverables ?? [])
      const uploaded = deliverables.filter((d) => (d.delivery_files ?? []).length > 0).length
      return { expected: deliverables.length, uploaded }
    }

    // Typical monthly volume — the most recent month that was actually set up
    // with deliverables. Used to size months that were never created at all.
    const sortedKeys = [...byMonth.keys()].sort()
    let typical = 0
    for (const key of [...sortedKeys].reverse()) {
      const { expected } = countFor(byMonth.get(key)!)
      if (expected > 0) { typical = expected; break }
    }
    if (typical === 0) typical = client.shoots_per_month ?? 0
    if (typical === 0) continue

    // Walk every month from the client's first content month to now, so gaps
    // show up as months rather than being skipped over.
    const first = byMonth.get(sortedKeys[0])!
    const months: MonthStatus[] = []
    let cursorYear = first.year
    let cursorMonth = first.monthIdx
    let guard = 0

    while (guard++ < 36) {
      const key = monthKey(cursorYear, cursorMonth)
      const entry = byMonth.get(key)
      const { expected, uploaded } = entry ? countFor(entry) : { expected: 0, uploaded: 0 }
      const effectiveExpected = entry && expected > 0 ? expected : typical

      months.push({
        month: key,
        label: monthLabel(cursorYear, cursorMonth),
        jobId: entry?.jobs[0]?.id ?? null,
        jobName: entry?.jobs.map((j) => j.name).join(' + ') ?? null,
        expected: effectiveExpected,
        uploaded,
        missing: Math.max(0, effectiveExpected - uploaded),
        jobExists: !!entry,
        isCurrentMonth: key === currentKey,
      })

      if (key === currentKey) break
      cursorMonth++
      if (cursorMonth > 11) { cursorMonth = 0; cursorYear++ }
    }

    const pastMonths = months.filter((m) => !m.isCurrentMonth)
    const behindMonths = pastMonths.filter((m) => m.missing > 0)

    const allUploads = clientJobs
      .flatMap((j) => j.deliverables ?? [])
      .flatMap((d) => d.delivery_files ?? [])
      .map((f) => f.created_at)
      .filter(Boolean)
      .sort()

    result.push({
      clientId: client.id,
      clientName: client.name,
      monthlyRetainer: client.monthly_retainer,
      typicalVideosPerMonth: typical,
      months,
      overdueMonths: behindMonths.length,
      videosOwed: behindMonths.reduce((sum, m) => sum + m.missing, 0),
      monthsNeverStarted: pastMonths.filter((m) => !m.jobExists).length,
      currentMonth: months.find((m) => m.isCurrentMonth) ?? null,
      lastUploadAt: allUploads.length > 0 ? allUploads[allUploads.length - 1] : null,
    })
  }

  // Worst offenders first — that's the order Arlo needs to hear it in.
  result.sort((a, b) => b.videosOwed - a.videosOwed || b.overdueMonths - a.overdueMonths)

  return {
    today: nzNow.toLocaleDateString('en-CA'),
    current_month: currentKey,
    method: 'Videos counted from actual uploads to the client portal, not job status. A month with no job at all counts as fully outstanding, sized by that client\'s typical monthly volume.',
    clients: result,
    totals: {
      videos_owed: result.reduce((sum, c) => sum + c.videosOwed, 0),
      clients_behind: result.filter((c) => c.videosOwed > 0).length,
      months_never_started: result.reduce((sum, c) => sum + c.monthsNeverStarted, 0),
    },
  }
}

/**
 * Compact one-line-per-client summary for injecting into a prompt.
 *
 * Every tracked month is listed with its real numbers, including the ones that
 * are fully delivered. Summarising those as "all delivered" without figures
 * left a vacuum the model would fill with invented counts when asked about a
 * specific month, so the cheap fix is to never omit a number.
 */
export function summariseBacklog(backlog: ContentBacklog): string {
  if (backlog.clients.length === 0) return ''

  const pastPart = (m: MonthStatus) => {
    const flags: string[] = []
    if (!m.jobExists) flags.push('job never created')
    if (m.missing > 0) flags.push(`${m.missing} owed`)
    else flags.push('delivered')
    return `${m.label} ${m.uploaded}/${m.expected} (${flags.join(', ')})`
  }

  const lines = backlog.clients.map((c) => {
    const past = c.months.filter((m) => !m.isCurrentMonth)
    const headline = c.videosOwed > 0
      ? `owes ${c.videosOwed} video${c.videosOwed === 1 ? '' : 's'}`
      : 'owes nothing, past months all delivered'

    const pastText = past.length > 0 ? ` Past months: ${past.map(pastPart).join('; ')}.` : ''
    const cur = c.currentMonth
    const curText = cur
      ? ` Current month ${cur.label}: ${cur.uploaded}/${cur.expected} uploaded so far${cur.jobExists ? '' : ', job not created yet'}.`
      : ''

    return `${c.clientName} [$${c.monthlyRetainer ?? 0}/mo, ~${c.typicalVideosPerMonth} videos/month]: ${headline}.${pastText}${curText}`
  })

  return [
    'Retainer content backlog, counted from actual video files uploaded to the client portal rather than job status.',
    `AUTHORITATIVE TOTAL OWED: ${backlog.totals.videos_owed} video${backlog.totals.videos_owed === 1 ? '' : 's'} across ${backlog.totals.clients_behind} client${backlog.totals.clients_behind === 1 ? '' : 's'}. Use this number as given, and never recompute it.`,
    'Past months and the current month are two different categories and must never be added together into any combined figure, in any framing ("total videos to sort out", "across both months", "that need jobs and uploads", or similar). Only past months are behind. The current month is upcoming work still in progress, expected but not yet due, so its expected count is never debt and never joins a total with what is actually owed. If you want to mention both, say them as two separate sentences with two separate numbers, never summed.',
    'Every figure below is uploaded/expected, so quote them directly rather than estimating.',
    ...lines.map((l) => `  ${l}`),
  ].join('\n')
}
