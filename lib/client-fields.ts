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
 * The Industry dropdown. 'Other' covers anything that broadly fits — the
 * rebrand copy names construction, marine, agriculture and tourism as the
 * work that suits best, but that is positioning for the website, not a rule
 * for the CRM. A client record that already holds some other value keeps it as
 * an extra option rather than losing it.
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
