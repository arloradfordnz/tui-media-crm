/**
 * Format a number as NZD currency
 */
export function formatNZD(amount: number): string {
  return `$${amount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Always read in New Zealand time. Rows are stored as UTC instants, and the
// server runs in UTC, so with local getters a document made at 8am on the 14th
// in Nelson (7pm on the 13th UTC) was shown as the 13th, and the same date
// differed between the server render and the browser.
const NZ_TZ = 'Pacific/Auckland'
function nzParts(d: Date): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-NZ', { timeZone: NZ_TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).formatToParts(d)) {
    out[p.type] = p.value
  }
  return out
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  const p = nzParts(d)
  return `${p.day}/${p.month}/${p.year}`
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  const p = nzParts(d)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toLowerCase()}`.trim()
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Get human-readable label for a status
 */
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    enquiry: 'Enquiry',
    discovery: 'Discovery',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost',
    contract: 'Contract',
    booked: 'Booked',
    preproduction: 'Pre-production',
    shootday: 'Shoot Day',
    editing: 'Editing',
    review: 'Review',
    approved: 'Approved',
    delivered: 'Delivered',
    archived: 'Archived',
    lead: 'Lead',
    active: 'Active',
    past: 'Past',
    retainer: 'Retainer',
    marketing: 'Marketing',
    one_off: 'One-off',
    video_ads: 'Video Ads',
    available: 'Available',
    out_on_shoot: 'Out on Shoot',
    in_service: 'In Service',
    retired: 'Retired',
    not_sent: 'Not Sent',
    sent: 'Sent',
    viewed: 'Viewed',
    first_cut: 'First Cut',
    revised_cut: 'Revised Cut',
    final: 'Final',
    raw: 'Raw Files',
    wedding: 'Wedding',
    anniversary: 'Anniversary & Couples',
    corporate: 'Corporate',
    event: 'Event',
    realestate: 'Real Estate',
    social_media: 'Social Media',
    custom: 'Custom',
    preshoot: 'Pre-shoot',
    postproduction: 'Post-production',
    delivery: 'Delivery',
    // The video ad project: strategise → script → film → edit → launch, then
    // the handover that ends it. `live` and `handed_over` are job statuses;
    // a campaign that is running is neither "approved" nor "delivered".
    strategise: 'Strategise',
    script: 'Script',
    film: 'Film',
    edit: 'Edit',
    launch: 'Launch & Manage',
    handover: 'Handover',
    live: 'Live',
    handed_over: 'Handed Over',
    shoot: 'Shoot',
    call: 'Call',
    deadline: 'Deadline',
    personal: 'Personal',
    draft: 'Draft',
    accepted: 'Accepted',
    declined: 'Declined',
    proposal_created: 'Proposal Created',
    proposal_sent: 'Proposal Sent',
    proposal_accepted: 'Proposal Accepted',
    proposal_declined: 'Proposal Declined',
  }
  return labels[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
}

/**
 * Get badge CSS class for a status
 */
export function statusBadgeClass(status: string): string {
  const success = ['active', 'approved', 'delivered', 'completed', 'available', 'booked', 'accepted', 'won', 'retainer', 'marketing', 'one_off', 'video_ads', 'handed_over']
  const warning = ['review', 'pending', 'in_service', 'editing', 'preproduction', 'discovery', 'proposal', 'draft', 'negotiation']
  const danger = ['overdue', 'rejected', 'archived', 'retired', 'past', 'declined', 'lost']
  const accent = ['enquiry', 'lead', 'shootday', 'out_on_shoot', 'contract', 'sent', 'live']

  if (success.includes(status)) return 'badge-success'
  if (warning.includes(status)) return 'badge-warning'
  if (danger.includes(status)) return 'badge-danger'
  if (accent.includes(status)) return 'badge-accent'
  return 'badge-muted'
}

/**
 * Strip "Client Name — " or "Client Name - " prefix from a job name for display.
 */
export function stripJobPrefix(name: string): string {
  const emDash = name.indexOf(' — ')
  if (emDash !== -1) return name.slice(emDash + 3)
  const dash = name.indexOf(' - ')
  if (dash !== -1) return name.slice(dash + 3)
  return name
}

/**
 * Relative time description
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return formatDate(d)
}

/**
 * The name you'd actually say out loud.
 *
 * `contact_person` is stored as a full name, so greeting someone with it read
 * as "Kia ora, Sarah Bainbridge" — correct, and colder than a form letter.
 * A company name is left whole, since "Kia ora, Team" is worse than "Kia ora,
 * Team Bainbridge": only a value that looks like a person's name is shortened.
 */
export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return ''
  const first = trimmed.split(/\s+/)[0]
  // An initial ("J. Smith") is not a name to greet someone by, and a one-word
  // value is already as short as it gets.
  if (first.length <= 2 && trimmed.includes(' ')) return trimmed
  return first
}
