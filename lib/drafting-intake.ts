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

/** A proposal already made for this client's work, which the contract builds on. */
export type ProposalCtx = {
  status: string
  job: string
  total: number
  lines: string[]
  paymentTerms: string
}

// Decided by the job when there is one (see classifyEngagement): a one-off
// event for a client who also has a retainer is still a one-off.
function isRetainer(client: ClientCtx, job?: JobCtx | null): boolean {
  return classifyEngagement(job ?? null, client) === 'monthly_retainer'
}

// ── Proposals ────────────────────────────────────────────────

export const PROPOSAL_REQUIRED_KEYS = [
  'goal', 'audience', 'platforms', 'deliverables', 'filming', 'timeline',
  'price', 'price_layout', 'payment_terms', 'travel', 'inclusions', 'exclusions', 'angle', 'valid_for',
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
    key: 'travel',
    question: `Travel: which places are included in the price, and what's the fee beyond that? (name the places)`,
    options: opts(
      { label: 'Nelson and Richmond included, +$30 a shoot beyond', detail: 'Flat fee, named zones' },
      { label: 'Nelson only, +$30 a shoot beyond' },
      { label: 'All of Nelson Tasman included', detail: 'No travel fee' },
      { label: 'No travel fee at all' },
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
//
// A contract is for ONE job, and its shape comes from that job. It used to be
// decided from the client: anyone who had ever had a retainer got retainer
// questions, so a one-off event for a retainer client (Team Bainbridge's
// "Heave For Hospice") was asked about monthly videos and rollover. The job
// decides now, and the client's retainer only counts when there is no job.

export type Engagement = 'video_ad_project' | 'monthly_retainer' | 'event_coverage' | 'photography' | 'other'

export const ENGAGEMENT_LABEL: Record<Engagement, string> = {
  event_coverage: 'One-off event',
  monthly_retainer: 'Monthly content retainer',
  video_ad_project: 'One-off video ad project',
  photography: 'Photography job',
  other: 'Other one-off job',
}

const EVENT_RE = /\b(event|expo|festival|wedding|conference|gala|awards?|launch party|concert|fundraiser|tournament|race|show|wrap video|highlight)\b/i
const RETAINER_RE = /\b(monthly|retainer|content (trial|month)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* content)\b/i

/** What kind of contract this job needs, from the job first. */
export function classifyEngagement(job: JobCtx | null, client: ClientCtx): Engagement {
  if (job) {
    const text = `${job.name} ${job.notes ?? ''}`
    if (job.job_type === 'event' || job.job_type === 'wedding' || EVENT_RE.test(job.name)) return 'event_coverage'
    if (RETAINER_RE.test(job.name)) return 'monthly_retainer'
    if (/photo/i.test(`${job.job_type ?? ''} ${job.name}`)) return 'photography'
    if (job.job_type === 'social_media' && /content/i.test(job.name)) return 'monthly_retainer'
    if (/\bads?\b|campaign/i.test(text) || job.job_type === 'commercial' || job.job_type === 'marketing') return 'video_ad_project'
    return 'other'
  }
  return client.client_category === 'retainer' || client.monthly_retainer ? 'monthly_retainer' : 'video_ad_project'
}

// Ownership and portfolio used to be asked every time and answered the same
// way every time. They are settled terms now, confirmed with the rest in
// standard_terms, and create_contract fills them in.
export const CONTRACT_DEFAULT_BRIEF: Record<string, string> = {
  ownership: 'Client owns the final videos once paid (copyright assigned on payment in full)',
  portfolio: 'Tui Media may show the work in its portfolio and socials unless the Client says no',
}

export function contractRequiredKeys(engagement: string): string[] {
  const common = ['what', 'fee', 'payment', 'travel', 'standard_terms', 'special_requests']
  if (engagement === 'monthly_retainer') return [...common, 'start']
  if (engagement === 'event_coverage') return [...common, 'event_details', 'event_hours', 'turnaround', 'cancellation']
  return [...common, 'start', 'cancellation']
}

const CLIENT_DETAIL_QUESTIONS: Record<string, (who: string) => IntakeQuestion> = {
  entity_type: (who) => ({ key: 'entity_type', question: `Is ${who} a company or a sole trader?`, options: [{ label: 'Company' }, { label: 'Sole trader' }, { label: 'Partnership' }, { label: 'Private individual' }] }),
  legal_name: (who) => ({ key: 'legal_name', question: `${who}'s exact legal name? (the registered company name, or the owner's full name for a sole trader)`, options: [] }),
  contact_person: (who) => ({ key: 'contact_person', question: `Who signs for ${who}? Full name and role.`, options: [] }),
  email: (who) => ({ key: 'email', question: `${who}'s email for the contract?`, options: [] }),
  phone: (who) => ({ key: 'phone', question: `${who}'s phone number?`, options: [] }),
  location: (who) => ({ key: 'location', question: `Where is ${who} based? (town or address)`, options: [] }),
}

const TRAVEL_Q: IntakeQuestion = {
  key: 'travel',
  question: `Travel: which places are included in the price, and what's the fee beyond that? (name the places)`,
  options: opts(
    { label: 'Nelson and Richmond included, +$30 a shoot beyond', detail: 'Flat fee, named zones' },
    { label: 'Nelson only, +$30 a shoot beyond' },
    { label: 'All of Nelson Tasman included', detail: 'No travel fee' },
    { label: 'No travel fee at all' },
  ),
}

export function buildContractIntake(
  client: ClientCtx,
  job: JobCtx | null,
  engagement: Engagement,
  missingClientDetails: string[],
  proposal?: ProposalCtx | null,
): IntakeQuestion[] {
  const who = client.name
  const retainer = engagement === 'monthly_retainer'
  const event = engagement === 'event_coverage'
  const deliverablesOnRecord = (job?.deliverables ?? []).map((d) => d.title).filter(Boolean)
  const shoot = niceDate(job?.shoot_date)
  const q: IntakeQuestion[] = []

  // First, so a wrong guess is caught before anything else is answered. If
  // Arlo picks a different kind, Tui rebuilds the intake for that kind.
  const others = (Object.keys(ENGAGEMENT_LABEL) as Engagement[]).filter((e) => e !== engagement)
  q.push({
    key: 'engagement',
    question: `What kind of contract is this${job ? ` (for "${job.name}"${shoot ? `, ${shoot}` : ''})` : ''}?`,
    options: opts(
      { label: ENGAGEMENT_LABEL[engagement], detail: 'From the job' },
      ...others.slice(0, 3).map((e) => ({ label: ENGAGEMENT_LABEL[e] })),
    ),
  })

  q.push(...missingClientDetails.map((k) => CLIENT_DETAIL_QUESTIONS[k]?.(who)).filter((x): x is IntakeQuestion => !!x))

  if (event) {
    q.push({
      key: 'event_details',
      question: `The event: name, date, start and finish times, and venue?`,
      options: opts(
        (shoot || job?.shoot_location) && { label: [job?.name, shoot, job?.shoot_location].filter(Boolean).join(', ').slice(0, 80), detail: 'From the job. Type times if you have them' },
        // A lone option turns the question into a typed one (see opts), which
        // would hide what the job already knows.
        (shoot || job?.shoot_location) && { label: 'Different details', detail: 'Type them' },
      ),
    })
    q.push({
      key: 'event_hours',
      question: `Hours of coverage, and overtime if it runs over?`,
      options: opts(
        { label: '4 hours, $150/hr overtime' },
        { label: '6 hours, $150/hr overtime' },
        { label: 'Whole event, no overtime', detail: 'Fixed fee whatever it runs to' },
      ),
    })
  }

  q.push({
    key: 'what',
    question: event
      ? `What does ${who} get from the event?`
      : `What is ${who} getting? Videos, lengths, platforms.`,
    options: opts(
      proposal && proposal.lines.length > 0 && { label: `As in the ${proposal.status} proposal for ${proposal.job}`.slice(0, 80), detail: proposal.lines.join('; ').slice(0, 120) },
      deliverablesOnRecord.length > 0 && { label: `As on the job: ${deliverablesOnRecord.slice(0, 3).join(', ')}`.slice(0, 80) },
      retainer && client.videos_per_month && { label: `${client.videos_per_month} videos a month, as on record` },
      event && { label: '2 to 3 min highlight film + 3 short socials' },
      event && { label: 'Highlight film + wrap video', detail: 'A recap of the whole event' },
      retainer && { label: '4 vertical videos a month, 15 to 45s each' },
      engagement === 'video_ad_project' && { label: '1 x 45s ad + 3 x 15s cut-downs, 1 month of ads managed' },
    ),
  })

  if (event) {
    q.push({
      key: 'turnaround',
      question: `When is it delivered?`,
      options: opts(
        { label: 'Highlight within 7 days' },
        { label: 'A social clip the same day, highlight within 7 days' },
        { label: 'Within 14 days' },
      ),
    })
  }

  q.push({
    key: 'fee',
    question: `The fee${retainer ? ' per month' : ''}?`,
    options: opts(
      proposal && proposal.total > 0 && { label: `${nzd(proposal.total)}, as in the ${proposal.status} proposal`.slice(0, 80) },
      job?.quote_value && { label: `${nzd(job.quote_value)}, as quoted for ${job.name}`.slice(0, 80) },
      retainer && client.monthly_retainer && { label: `${nzd(client.monthly_retainer)} a month, as on record` },
      { label: 'A different fee', detail: 'Type it' },
    ),
  })
  q.push({
    key: 'payment',
    question: `How is it paid?`,
    options: opts(
      proposal?.paymentTerms && { label: 'Same payment terms as the proposal', detail: proposal.paymentTerms.slice(0, 120) },
      retainer && { label: 'Monthly in advance, no deposit' },
      !retainer && { label: '50% deposit on signing, 50% on delivery', detail: event ? 'Deposit holds the date' : undefined },
      !retainer && { label: '100% on signing' },
      !retainer && { label: 'Full amount on delivery' },
    ),
  })
  q.push(TRAVEL_Q)

  if (!event) {
    q.push({
      key: 'start',
      question: retainer ? `When does it start?` : `When is the shoot?`,
      options: opts(
        shoot && !retainer && { label: `${shoot}, as on the job` },
        { label: 'The day both sign' },
        retainer && { label: 'The 1st of next month' },
        !retainer && { label: 'A date to agree after signing' },
      ),
    })
  }
  if (!retainer) {
    q.push({
      key: 'cancellation',
      question: event
        ? `If ${who} cancels or the event is called off, what happens to the deposit?`
        : `If ${who} cancels, what happens to the deposit?`,
      options: opts(
        { label: 'Kept if cancelled within 14 days', detail: 'Refunded before that' },
        { label: 'Always kept, it secures the date' },
        event && { label: 'Moved to a new date if the event is postponed' },
        { label: 'Refunded less costs spent' },
      ),
    })
  }
  q.push({
    key: 'standard_terms',
    question: `Keep the standard terms? They own the videos once paid, Tui Media can show them in its portfolio, 2 revision rounds, invoices due in 14 days${retainer ? ", 14 days' notice to end" : ''}.`,
    options: opts(
      { label: 'Keep all the standard terms' },
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
  return q
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
