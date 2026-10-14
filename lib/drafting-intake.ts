// The intake for anything the Opus drafter writes: proposals and contracts.
//
// Every Opus draft costs real money, and a draft built on half the facts gets
// revised, which costs it again. The chat model (Haiku, at low effort) was
// left to decide what to ask, and it asked a couple of small, random things
// and drafted on the rest. So the question list is no longer its call: it is
// built here, from the record, the same complete checklist every time, with
// what the CRM already knows put first as the answer to tap. Tui passes it to
// ask_arlo as one popup, and create_proposal / create_contract refuse to run
// until every required answer is in the brief. One popup, one draft.

export type IntakeOption = { label: string; detail?: string }
export type IntakeQuestion = {
  /** The brief key this answer fills. */
  key: string
  question: string
  options: IntakeOption[]
  multi?: boolean
}

const nzd = (n: number) => `$${Number(n).toLocaleString('en-NZ', { maximumFractionDigits: 2 })}`

function niceDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
}

// A question has 0 options (typed answer) or 2 to 5. Drops empties and
// duplicates so a record value that matches a stock option is not shown twice.
function opts(...list: (IntakeOption | null | false | undefined | 0 | "")[]): IntakeOption[] {
  const seen = new Set<string>()
  const out = list.filter((o): o is IntakeOption => !!o && !!o.label).filter((o) => {
    const k = o.label.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 5)
  return out.length === 1 ? [] : out
}

type ClientCtx = {
  name: string
  contact_person?: string | null
  monthly_retainer?: number | null
  videos_per_month?: number | null
  shoots_per_month?: number | null
  client_category?: string | null
}

type JobCtx = {
  id: string
  name: string
  job_type?: string | null
  shoot_date?: string | null
  shoot_location?: string | null
  quote_value?: number | null
  notes?: string | null
  deliverables?: { title: string }[]
}

function isRetainer(client: ClientCtx, job?: JobCtx | null): boolean {
  return client.client_category === 'retainer' || /content|retainer/i.test(job?.name ?? '') || !!client.monthly_retainer
}

// ── Proposals ────────────────────────────────────────────────

export const PROPOSAL_REQUIRED_KEYS = [
  'goal', 'audience', 'platforms', 'deliverables', 'filming', 'timeline',
  'price', 'price_layout', 'payment_terms', 'inclusions', 'exclusions', 'angle', 'valid_for',
] as const

export function buildProposalIntake(client: ClientCtx, job: JobCtx | null, otherJobs: { id: string; name: string }[]): IntakeQuestion[] {
  const who = client.name
  const retainer = isRetainer(client, job)
  const deliverablesOnRecord = (job?.deliverables ?? []).map((d) => d.title).filter(Boolean)
  const q: IntakeQuestion[] = []

  if (!job) {
    q.push({
      key: 'job',
      question: `Which job is this proposal for? It needs one to attach to.`,
      options: opts(
        ...otherJobs.slice(0, 3).map((j) => ({ label: j.name })),
        { label: 'A new job', detail: 'Tui creates it from your answers first' },
      ),
    })
  }

  q.push({
    key: 'goal',
    question: `What does ${who} want this to achieve?`,
    multi: true,
    options: opts(
      { label: 'More enquiries and sales' },
      { label: 'Brand awareness locally' },
      { label: 'Hire staff' },
      { label: 'Launch something new', detail: 'A product, venue, event or service' },
    ),
  })
  q.push({
    key: 'audience',
    question: `Who is ${who} trying to reach? (who their customer is, and where)`,
    options: [],
  })
  q.push({
    key: 'platforms',
    question: `Where will the videos be used?`,
    multi: true,
    options: opts(
      { label: 'Instagram and Facebook' },
      { label: 'TikTok' },
      { label: 'YouTube' },
      { label: 'Their website' },
    ),
  })
  q.push({
    key: 'deliverables',
    question: `What exactly is ${who} getting? Number of videos, lengths, formats.`,
    options: opts(
      deliverablesOnRecord.length > 0 && { label: `As on the job: ${deliverablesOnRecord.slice(0, 3).join(', ')}${deliverablesOnRecord.length > 3 ? '…' : ''}`.slice(0, 80) },
      retainer && client.videos_per_month && { label: `${client.videos_per_month} videos a month, as on record` },
      retainer
        ? { label: '4 vertical videos a month, 15 to 45s each', detail: 'For Reels, TikTok and stories' }
        : { label: '1 x 45s ad + 3 x 15s cut-downs, vertical and square' },
      !retainer && { label: '2 x 30s ads + 4 x 15s cut-downs, vertical' },
      !retainer && { label: '2 to 3 min highlight film + 3 x 30s socials', detail: 'For events' },
    ),
  })
  q.push({
    key: 'filming',
    question: `How much filming, and where?`,
    options: opts(
      job?.shoot_location && { label: `${retainer && client.shoots_per_month ? `${client.shoots_per_month} shoot(s) a month` : 'Half day'} at ${job.shoot_location}`.slice(0, 80) },
      retainer
        ? { label: `${client.shoots_per_month || 1} shoot a month, about 1 hour` }
        : { label: 'Half day (about 4 hours)' },
      { label: 'Full day (about 8 hours)' },
      { label: '2 hours on location' },
    ),
  })
  const shoot = niceDate(job?.shoot_date)
  q.push({
    key: 'timeline',
    question: `What are the key dates? (shoot, delivery, go-live or deadline)`,
    options: opts(
      shoot && { label: `Shoot ${shoot}, delivered within 2 weeks` },
      retainer
        ? { label: 'Starts this month, rolling monthly' }
        : { label: 'Shoot within 2 weeks of saying yes' },
      { label: 'Has to be live by a set date', detail: 'Type the date' },
    ),
  })
  q.push({
    key: 'price',
    question: `What's the price${retainer ? ' per month' : ''}? (no GST, Tui Media isn't registered)`,
    options: opts(
      job?.quote_value ? { label: `${nzd(job.quote_value)}, as quoted` } : null,
      retainer && client.monthly_retainer ? { label: `${nzd(client.monthly_retainer)} a month, as on record` } : null,
    ),
  })
  q.push({
    key: 'price_layout',
    question: `How should the price be laid out?`,
    options: opts(
      { label: 'One project fee', detail: 'A single line, simplest to say yes to' },
      { label: 'Itemised by stage', detail: 'Strategy and script, filming, editing, ad management' },
      { label: 'Main fee plus optional add-ons' },
      { label: 'Packages to pick one from', detail: 'Client chooses a package, no total shown' },
    ),
  })
  q.push({
    key: 'payment_terms',
    question: `How will ${who} pay?`,
    options: opts(
      retainer
        ? { label: 'Monthly in advance, no deposit' }
        : { label: '50% deposit, 50% on delivery', detail: 'Deposit locks in the shoot date' },
      !retainer && { label: '100% upfront' },
      !retainer && { label: '50% deposit, 50% before the shoot' },
      { label: 'Full amount on delivery' },
    ),
  })
  q.push({
    key: 'inclusions',
    question: `What's included? Pick everything that applies.`,
    multi: true,
    options: opts(
      { label: 'Concept and script' },
      { label: 'Licensed music and captions' },
      { label: 'Ad setup and 1 month managed', detail: 'Then everything handed over' },
      { label: 'Drone footage' },
      { label: 'Raw footage handed over' },
    ),
  })
  q.push({
    key: 'exclusions',
    question: `Anything to spell out as NOT included?`,
    multi: true,
    options: opts(
      { label: 'Ad spend (paid by the client)' },
      { label: 'Travel outside Nelson' },
      { label: 'Extra revision rounds past 2' },
      { label: 'Nothing to add' },
    ),
  })
  q.push({
    key: 'angle',
    question: `What should the cover note lean on? Anything ${client.contact_person || who} said that matters to them.`,
    options: opts(
      { label: 'Getting them more customers' },
      { label: 'Showing off their team and story' },
      { label: 'Fast, easy, low hassle for them' },
    ),
  })
  q.push({
    key: 'valid_for',
    question: `How long is the price good for?`,
    options: opts(
      { label: '30 days' },
      { label: '14 days' },
      shoot && { label: `Until the ${shoot} shoot` },
    ),
  })
  return q
}

// ── Contracts ────────────────────────────────────────────────

export const CONTRACT_REQUIRED_KEYS = [
  'what', 'fee', 'payment', 'start', 'ownership', 'portfolio', 'standard_terms', 'special_requests',
] as const

export function contractRequiredKeys(engagement: string): string[] {
  const keys: string[] = [...CONTRACT_REQUIRED_KEYS]
  if (engagement === 'video_ad_project' || engagement === 'photography' || engagement === 'other') keys.push('cancellation')
  if (engagement === 'event_coverage') keys.push('cancellation', 'event_hours')
  return keys
}

const CLIENT_DETAIL_QUESTIONS: Record<string, (who: string) => IntakeQuestion> = {
  entity_type: (who) => ({ key: 'entity_type', question: `Is ${who} a company or a sole trader?`, options: [{ label: 'Company' }, { label: 'Sole trader' }, { label: 'Partnership' }, { label: 'Private individual' }] }),
  legal_name: (who) => ({ key: 'legal_name', question: `${who}'s exact legal name? (the registered company name, or the owner's full name for a sole trader)`, options: [] }),
  contact_person: (who) => ({ key: 'contact_person', question: `Who signs for ${who}, and their role?`, options: [] }),
  email: (who) => ({ key: 'email', question: `${who}'s email for the contract?`, options: [] }),
  phone: (who) => ({ key: 'phone', question: `${who}'s phone number?`, options: [] }),
  location: (who) => ({ key: 'location', question: `Where is ${who} based? (town or address)`, options: [] }),
}

export function buildContractIntake(
  client: ClientCtx,
  jobs: JobCtx[],
  missingClientDetails: string[],
): IntakeQuestion[] {
  const who = client.name
  const retainer = isRetainer(client, jobs[0])
  const quoted = jobs.find((j) => j.quote_value)
  const q: IntakeQuestion[] = missingClientDetails.map((k) => CLIENT_DETAIL_QUESTIONS[k]?.(who)).filter((x): x is IntakeQuestion => !!x)

  q.push({
    key: 'what',
    question: `What is ${who} getting under this contract? Videos, lengths, platforms.`,
    options: opts(
      retainer && client.videos_per_month && { label: `${client.videos_per_month} videos a month, as on record` },
      quoted && { label: `As in the "${quoted.name}" job`.slice(0, 80) },
      retainer ? { label: '4 vertical videos a month, 15 to 45s each' } : { label: '1 x 45s ad + 3 x 15s cut-downs, 1 month of ads managed' },
    ),
  })
  q.push({
    key: 'fee',
    question: `The fee${retainer ? ' per month' : ''}?`,
    options: opts(
      retainer && client.monthly_retainer && { label: `${nzd(client.monthly_retainer)} a month, as on record` },
      quoted?.quote_value && { label: `${nzd(quoted.quote_value)}, as quoted for ${quoted.name}`.slice(0, 80) },
    ),
  })
  q.push({
    key: 'payment',
    question: `How is it paid?`,
    options: opts(
      retainer ? { label: 'Monthly in advance, no deposit' } : { label: '50% deposit on signing, 50% on delivery' },
      !retainer && { label: '100% on signing' },
      !retainer && { label: '50% on signing, 50% before the shoot' },
    ),
  })
  const shoot = niceDate(jobs.find((j) => j.shoot_date)?.shoot_date)
  q.push({
    key: 'start',
    question: `When does it start?`,
    options: opts(
      { label: 'The day both sign' },
      { label: 'The 1st of next month' },
      shoot && { label: `Shoot on ${shoot}` },
    ),
  })
  q.push({
    key: 'ownership',
    question: `Who owns the finished videos?`,
    options: opts(
      { label: 'Client owns them once paid', detail: 'Copyright assigned on payment in full' },
      { label: 'Licence for their own channels', detail: 'Tui Media keeps copyright' },
    ),
  })
  q.push({
    key: 'portfolio',
    question: `Can Tui Media show the work in its portfolio and socials?`,
    options: opts(
      { label: 'Yes, unless they say no' },
      { label: 'Only with their permission' },
      { label: 'No, keep it private' },
    ),
  })
  q.push({
    key: 'cancellation',
    question: `If ${who} cancels a one-off job, what happens to the deposit?`,
    options: opts(
      { label: 'Kept if cancelled within 7 days', detail: 'Refunded before that' },
      { label: 'Always kept, it secures the date' },
      { label: 'Refunded less costs spent' },
    ),
  })
  q.push({
    key: 'event_hours',
    question: `For an event: hours of coverage and overtime rate?`,
    options: opts(
      { label: '4 hours, $150/hr overtime' },
      { label: '6 hours, $150/hr overtime' },
      { label: '8 hours, $150/hr overtime' },
    ),
  })
  q.push({
    key: 'standard_terms',
    question: `Keep the standard terms? 14 days' notice to end, 2 revision rounds, ~1 hr shoots, first edit in 3 days, invoices due in 14 days, free reschedule with 24 hrs' notice.`,
    options: opts(
      { label: 'Keep all the standard terms', detail: '2 revision rounds, 14 days notice, invoices due in 14 days, and the rest' },
      { label: 'Change some', detail: 'Type what to change' },
    ),
  })
  q.push({
    key: 'special_requests',
    question: `Anything ${who} asked for specifically, or anything unusual about this one?`,
    options: opts(
      { label: 'Nothing special' },
      { label: 'Yes', detail: 'Type it' },
    ),
  })
  // Drop what cannot apply: a retainer has no deposit to forfeit, and only an
  // event has coverage hours.
  const isEvent = jobs.some((j) => /event|wedding|expo|conference/i.test(`${j.job_type ?? ''} ${j.name}`))
  return q.filter((x) => (x.key !== 'cancellation' || !retainer) && (x.key !== 'event_hours' || isEvent))
}

/** Required keys the brief does not answer. Blank, "?" and "don't know" count as missing. */
export function missingBriefKeys(brief: unknown, required: readonly string[]): string[] {
  const b = (brief && typeof brief === 'object' ? brief : {}) as Record<string, unknown>
  return required.filter((k) => {
    const v = b[k]
    const s = Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? String(v) : typeof v === 'string' ? v : ''
    return !s.trim() || /^(\?|tbc|tbd|unknown|not sure|don'?t know|n\/a)$/i.test(s.trim())
  })
}

export function briefLines(brief: Record<string, unknown>): string {
  return Object.entries(brief)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim())
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join('\n')
}
