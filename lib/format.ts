/**
 * Format a number as NZD currency
 */
export function formatNZD(amount: number): string {
  return `$${amount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Format a date in NZ format: "4 Apr 2026"
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Format a date and time
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
    custom: 'Custom',
    preshoot: 'Pre-shoot',
    postproduction: 'Post-production',
    delivery: 'Delivery',
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
  const success = ['active', 'approved', 'delivered', 'completed', 'available', 'booked', 'accepted', 'won']
  const warning = ['review', 'pending', 'in_service', 'editing', 'preproduction', 'discovery', 'proposal', 'draft', 'negotiation']
  const danger = ['overdue', 'rejected', 'archived', 'retired', 'past', 'declined', 'lost']
  const accent = ['enquiry', 'lead', 'shootday', 'out_on_shoot', 'contract', 'sent']

  if (success.includes(status)) return 'badge-success'
  if (warning.includes(status)) return 'badge-warning'
  if (danger.includes(status)) return 'badge-danger'
  if (accent.includes(status)) return 'badge-accent'
  return 'badge-muted'
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
