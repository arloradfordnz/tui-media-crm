/**
 * The application questions, exactly as the form on tuimedia.nz asks them
 * (wireframe/index.html in the rebrand repo). Wording and options are copied,
 * not paraphrased, so an answer that arrives from the site shows up selected
 * on the client record. If the site changes a question, change it here too.
 */

export type ApplicationOption = { value: string; label: string; approx?: number | null }

const opts = (...labels: string[]): ApplicationOption[] => labels.map((l) => ({ value: l, label: l }))

export const INTEREST_OPTIONS = opts('A video ad project', 'Monthly content', 'Both', 'Not sure yet')

// `approx` is a midpoint in NZD. The site asks for a band, but the numeric
// columns still feed the new-job form and Insights, so a band is stored as its
// text AND as a rough number.
export const CUSTOMER_VALUE_OPTIONS: ApplicationOption[] = [
  { value: 'Under $200', label: 'Under $200', approx: 100 },
  { value: '$200 to $1k', label: '$200 to $1k', approx: 600 },
  { value: '$1k to $5k', label: '$1k to $5k', approx: 3000 },
  { value: '$5k+', label: '$5k+', approx: 5000 },
  { value: 'Varies a lot', label: 'Varies a lot', approx: null },
]

export const AD_SPEND_OPTIONS: ApplicationOption[] = [
  { value: 'Not running ads yet', label: 'Not running ads yet', approx: 0 },
  { value: 'Under $300 / month', label: 'Under $300 / month', approx: 150 },
  { value: '$300 to $800 / month', label: '$300 to $800 / month', approx: 550 },
  { value: '$800 to $2k / month', label: '$800 to $2k / month', approx: 1400 },
  { value: '$2k+ / month', label: '$2k+ / month', approx: 2000 },
]

export const START_OPTIONS = opts('Within a month', 'Next quarter', 'Just researching')
export const DECISION_OPTIONS = opts('Me', 'Me and a business partner', 'Someone else')
export const CAPACITY_OPTIONS = opts('Yes, plenty of room', 'Some room', 'Not yet, planning ahead')

export function approxFor(options: ApplicationOption[], value: string | null | undefined): number | null {
  return options.find((o) => o.value === value)?.approx ?? null
}

/**
 * Which band a plain number falls in, for records written before bands existed
 * (they hold only the number). Picks the option whose midpoint is nearest.
 */
export function bandFor(options: ApplicationOption[], n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  const withNumbers = options.filter((o) => o.approx !== null && o.approx !== undefined) as (ApplicationOption & { approx: number })[]
  return withNumbers.reduce((best, o) => (Math.abs(o.approx - n) < Math.abs(best.approx - n) ? o : best)).value
}

/** The options plus whatever is already stored, so a free-text answer typed before these dropdowns existed is never lost. */
export function withCurrent(options: ApplicationOption[], current: string | null | undefined): ApplicationOption[] {
  const base = [{ value: '', label: 'Not answered' }, ...options]
  if (current && !options.some((o) => o.value === current)) base.push({ value: current, label: current })
  return base
}
