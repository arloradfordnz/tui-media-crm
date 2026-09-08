// Shared between the new-client form, the client record and the enquiry
// endpoint, so the three agree on what a category is called and what the
// industry suggestions are.

/**
 * What the business has on its books — not what it is currently selling.
 *
 * `video_ads` is the offer after the rebrand. `retainer` and `marketing` stay
 * because a handful of retainer clients are still running and will be until
 * they are given notice; dropping the category would orphan those records and
 * make the wind-down impossible to track. `one_off` covers everything from
 * before that isn't either.
 */
export const CLIENT_CATEGORIES = [
  { value: 'video_ads', label: 'Video Ads' },
  { value: 'one_off', label: 'One-off' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'marketing', label: 'Marketing' },
] as const

/**
 * Suggestions, deliberately not a filter.
 *
 * The rebrand copy names construction, marine, agriculture and tourism as the
 * industries the work suits best. That is positioning for the website, not a
 * rule for the CRM — anything that broadly fits is worth taking. So this backs
 * a `<datalist>` on a free-text input: it makes the common answers one keypress
 * away without rejecting anything that isn't on the list.
 */
export const INDUSTRIES = [
  'Construction & Trades',
  'Marine & Engineering',
  'Agriculture & Horticulture',
  'Tourism & Hospitality',
  'Automotive',
  'Property & Real Estate',
  'Professional Services',
  'Retail & Hospitality',
  'Other',
]

/**
 * Tui Media is the commercial video ads brand. The personal/creative work is
 * splitting off into its own brand and should not show up in Tui Media's
 * pipeline, revenue or client list.
 */
export const BRANDS = [
  { value: 'tui_media', label: 'Tui Media' },
  { value: 'personal', label: 'Personal / Creative' },
] as const
