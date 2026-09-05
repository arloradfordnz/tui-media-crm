// The wire protocol between /api/ai/chat and every Tui surface.
//
// This replaces an inline-marker text stream ([[WORKING]], [[MUTATED]],
// [[LINK:path|label]] spliced into the prose) which had two real problems:
// the markers were indistinguishable from text the model might itself emit,
// and they carried no information about WHICH tool was running. So a turn that
// silently voided an invoice looked exactly like a turn that read the weather —
// three animated dots either way.
//
// Now every turn is a newline-delimited stream of typed events, and the tool
// calls are shown as receipts: what Tui read, what it wrote, and what failed.

export type TuiEvent =
  /** A delta of assistant prose. */
  | { t: 'text'; v: string }
  /** A tool call has started. `id` matches the later `tool_done`. */
  | { t: 'tool'; id: string; name: string; label: string }
  /** That tool call finished. `detail` is a short human summary of the result. */
  | { t: 'tool_done'; id: string; ok: boolean; detail?: string }
  /** A destructive tool was blocked pending explicit approval. */
  | { t: 'confirm'; fingerprint: string; action: string }
  /** An entity was created and is worth a jump-to button. */
  | { t: 'link'; path: string; label: string }
  /** Server data changed; the client should revalidate. */
  | { t: 'mutated' }
  /** The turn failed. Terminal. */
  | { t: 'error'; v: string }
  /** The turn is complete. Terminal. */
  | { t: 'done' }

export function encodeEvent(event: TuiEvent): string {
  return JSON.stringify(event) + '\n'
}

// Split a decoded chunk into whole events, returning any trailing partial line
// for the caller to prepend to the next chunk. A JSON object can and will be
// split across network chunks, so parsing per-chunk without this drops events.
export function decodeEvents(buffer: string): { events: TuiEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: TuiEvent[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as TuiEvent)
    } catch {
      // A malformed line is not worth killing the turn over.
    }
  }
  return { events, rest }
}

// ── Receipt labels ──────────────────────────────────────────────────────────

const TOOL_VERBS: Record<string, string> = {
  search_clients: 'Searching clients',
  get_client: 'Reading client',
  create_client: 'Creating client',
  update_client: 'Updating client',
  search_jobs: 'Searching jobs',
  get_job: 'Reading job',
  create_job: 'Creating job',
  update_job: 'Updating job',
  update_job_status: 'Moving job',
  delete_job: 'Deleting job',
  toggle_task: 'Updating task',
  list_todos: 'Reading to-dos',
  create_todo: 'Adding to-do',
  complete_todo: 'Completing to-do',
  list_events: 'Reading calendar',
  create_event: 'Adding to calendar',
  delete_event: 'Deleting event',
  list_documents: 'Reading documents',
  create_document: 'Creating document',
  delete_document: 'Deleting document',
  create_deliverable: 'Adding deliverable',
  list_deliverables: 'Reading deliverables',
  get_dashboard_stats: 'Checking the numbers',
  list_xero_contacts: 'Reading Xero contacts',
  create_xero_invoice: 'Raising Xero invoice',
  list_xero_invoices: 'Reading Xero invoices',
  approve_xero_invoice: 'Approving Xero invoice',
  void_xero_invoice: 'Voiding Xero invoice',
  delete_xero_invoice: 'Deleting Xero invoice',
  get_xero_invoice_detail: 'Reading Xero invoice',
  remove_xero_payment: 'Removing Xero payment',
  update_xero_invoice: 'Updating Xero invoice',
  list_recent_emails: 'Reading recent email',
  get_content_backlog: 'Checking retainer backlog',
  snooze_flag: 'Snoozing that',
  resolve_flag: 'Marking that resolved',
}

// The most identifying free-text argument, if the call has one. A receipt that
// says `Searching clients — "hamilton"` is worth far more than one that says
// `search_clients`, and IDs are noise, so only human-meaningful strings qualify.
const DETAIL_KEYS = ['query', 'name', 'title', 'search', 'status', 'reference']

export function toolLabel(name: string, input: Record<string, unknown>): string {
  const verb = TOOL_VERBS[name] ?? name.replace(/_/g, ' ')
  for (const key of DETAIL_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.trim() && value.length <= 60) {
      return `${verb} — ${value.trim()}`
    }
  }
  return verb
}

// A one-line human summary of what came back, from the JSON the executor
// returns. Best-effort by design: an unrecognised shape just gets no detail
// rather than a wrong one.
export function summariseResult(raw: string): { ok: boolean; detail?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: true }
  }

  if (Array.isArray(parsed)) {
    return { ok: true, detail: `${parsed.length} ${parsed.length === 1 ? 'result' : 'results'}` }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: true }

  const obj = parsed as Record<string, unknown>

  if (obj.status === 'confirmation_required') return { ok: true, detail: 'needs confirmation' }
  if (typeof obj.error === 'string') return { ok: false, detail: obj.error.slice(0, 120) }
  if (obj.success === false) return { ok: false, detail: 'failed' }

  // The list-shaped tools return the rows under some plural key.
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      return { ok: true, detail: `${value.length} ${key.replace(/_/g, ' ')}` }
    }
  }

  return { ok: true }
}
