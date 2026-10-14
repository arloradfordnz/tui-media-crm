import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { fetchXeroContacts, createXeroInvoice, fetchOutstandingInvoices, approveXeroInvoice, emailXeroInvoice, voidXeroInvoice, deleteXeroInvoice, updateXeroInvoice, getXeroInvoice, deleteXeroPayment } from '@/lib/xero'
import { fetchRecentEmails, fetchUnreadEmails } from '@/lib/mail'
import { getContentBacklog, parseJobMonth } from '@/lib/content-backlog'
import { findDuplicateJobName } from '@/lib/job-naming'
import { syncShootEvent, removeShootEvent } from '@/lib/job-calendar'
import { nextDocumentNumber, unfilledPlaceholders } from '@/lib/document-templates'
import { draftContract, reviseContract, SETTLED_CONTRACT_TERMS, type ContractParties } from '@/lib/contract-drafting'
import { MEMORY_CATEGORY_KEYS, isMemoryCategory } from '@/lib/ai-memory'
import { buildProposalIntake, buildContractIntake, PROPOSAL_REQUIRED_KEYS, contractRequiredKeys, missingBriefKeys, briefLines } from '@/lib/drafting-intake'
import { draftProposal, type PriceLine } from '@/lib/proposal-drafting'

// Shared tool definitions + executor for every AI surface (dashboard chat,
// SMS assistant). One tool set, one set of side effects — a job marked
// "delivered" from a text message must behave identically to marking it
// delivered from the dashboard.

// Every *_id lookup below takes whatever string the model passes as a real
// database id — and a model that hasn't actually looked the record up yet
// will sometimes invent a plausible-looking one ("SKY00002" for a Sky
// Automotive job) rather than call search_jobs/search_clients first. Postgres
// then rejects it as invalid UUID syntax, and that raw message ("invalid
// input syntax for type uuid: \"SKY00002\"") used to go straight back to the
// model as the tool result, which relayed it to Arlo verbatim as if it were a
// real error condition. It isn't — it's the model guessing. Route every id
// lookup's error through this so the tool result says what actually happened
// and tells the model what to do about it (search first) instead of a
// database internals message it has no way to act on.
function dbErrorMessage(error: { message: string; code?: string }): string {
  // Postgres 22P02 = invalid_text_representation, the code for "this string
  // isn't a UUID at all" — distinct from a well-formed id that just doesn't
  // exist, which comes back as a clean empty result, not this.
  if (error.code === '22P02') {
    return 'That ID is not a real one. IDs are UUIDs returned by a search tool (search_jobs, search_clients, and so on) — never invent or guess one. Search for the record first and use the ID it returns.'
  }
  return error.message
}

// Tools that only make sense on a surface that can render them. ask_arlo pops
// up tap-to-answer options in the dashboard chat; Telegram has no popup, so
// the Telegram brain is not offered it (lib/assistant-agent.ts).
export const DASHBOARD_ONLY_TOOLS = new Set(['ask_arlo'])

// Tool names that mutate state — used by callers to decide whether to
// invalidate a cached view (dashboard router.refresh()) after the turn.
export const MUTATING_TOOLS = new Set([
  'create_client', 'update_client',
  'create_job', 'update_job', 'update_job_status', 'delete_job', 'toggle_task',
  'create_event', 'update_event', 'delete_event',
  'create_document', 'delete_document',
  'create_contract', 'update_contract',
  'create_proposal', 'update_proposal',
  'create_deliverable',
  'create_todo', 'complete_todo',
  'create_xero_invoice', 'approve_xero_invoice', 'send_xero_invoice', 'void_xero_invoice', 'delete_xero_invoice', 'update_xero_invoice', 'remove_xero_payment',
  'log_shoot',
  'snooze_flag', 'resolve_flag',
  'add_subscription', 'update_subscription', 'cancel_subscription',
  'remember', 'update_memory', 'forget',
])

// ── Confirmation gate ────────────────────────────────────────
// Tools that destroy something a person cannot get back: a voided Xero
// invoice has no un-void, a deleted job takes its tasks and deliverables with
// it, and removing a payment un-reconciles the bank transaction behind it.
//
// Until now the only thing standing between the model and any of these was a
// sentence in a prompt asking it to be careful. That is not a control — it is
// a preference, and one bad turn or one crafted inbound message is enough to
// lose the data. This gate lives at the executor, below the model, so no
// wording in any prompt can route around it.
export const CONFIRM_TOOLS = new Set([
  // Emailing an invoice leaves the building. It is not destructive, but it is
  // the one write here that a client sees, and an invoice sent to the wrong
  // contact or for the wrong amount costs more to walk back than a deleted
  // row does. Arlo presses the button, not the model.
  'send_xero_invoice',
  'delete_job',
  'delete_event',
  'delete_document',
  'void_xero_invoice',
  'delete_xero_invoice',
  'remove_xero_payment',
])

// Stable identity for one specific proposed action. Keys are sorted so the
// same call always fingerprints the same way, and approving "delete job X"
// can never authorise "delete job Y" — the approval is bound to the arguments,
// not just to the tool name.
export function toolFingerprint(name: string, input: Record<string, unknown>): string {
  const sorted = Object.keys(input).sort().map((k) => [k, input[k]] as const)
  const payload = JSON.stringify([name, sorted])
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

// How the confirmation card is drawn. Sending an invoice is an ordinary
// forward step Arlo asked for, so its card is green; the rest destroy
// something and stay red.
export function confirmTone(name: string): 'go' | 'danger' {
  return name === 'send_xero_invoice' ? 'go' : 'danger'
}

const nzdFmt = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

// Plain-English description of what is about to happen, so the confirmation
// the user sees is about the act, not about a tool name. Reads the record so
// the card names the invoice, client and amount instead of showing an id.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function describeAction(name: string, input: Record<string, unknown>, supabase: any): Promise<string> {
  const id = (k: string) => String(input[k] ?? '')
  const nameOf = async (table: string, col: string, key: string, fallback: string) => {
    try {
      const { data } = await supabase.from(table).select(col).eq('id', id(key)).maybeSingle()
      return (data as Record<string, string> | null)?.[col] ? `"${(data as Record<string, string>)[col]}"` : fallback
    } catch { return fallback }
  }
  const xeroInvoice = async () => {
    try { return await getXeroInvoice(id('invoice_id')) } catch { return null }
  }
  const invoiceLabel = (inv: Awaited<ReturnType<typeof getXeroInvoice>>) =>
    inv ? `invoice ${inv.InvoiceNumber}${inv.Contact?.Name ? ` for ${inv.Contact.Name}` : ''} (${nzdFmt.format(inv.Total)})` : 'this invoice'

  switch (name) {
    case 'send_xero_invoice': {
      const inv = await xeroInvoice()
      if (!inv) return 'Email this invoice to the client.'
      const to = inv.Contact?.Name ? ` to ${inv.Contact.Name}` : ' to the client'
      const draft = inv.Status === 'DRAFT' ? ' It will be approved first.' : ''
      return `Email invoice ${inv.InvoiceNumber} (${nzdFmt.format(inv.Total)})${to}.${draft}`
    }
    case 'delete_job': return `Delete ${await nameOf('jobs', 'name', 'job_id', 'this job')} with its tasks and deliverables. This can't be undone.`
    case 'delete_event': return `Delete ${await nameOf('events', 'title', 'event_id', 'this event')} from the calendar.`
    case 'delete_document': return `Delete ${await nameOf('documents', 'name', 'document_id', 'this document')}. This can't be undone.`
    case 'void_xero_invoice': return `Void ${invoiceLabel(await xeroInvoice())}. Xero has no un-void.`
    case 'delete_xero_invoice': return `Delete ${invoiceLabel(await xeroInvoice())}. This can't be undone.`
    case 'remove_xero_payment': return 'Remove this Xero payment. The bank transaction it was matched to becomes unreconciled and needs matching again.'
    default: return `Run ${name}.`
  }
}

export type ExecuteToolOptions = {
  /** Fingerprints the user has explicitly approved this turn. */
  approvals?: string[]
}

export const TOOLS: Anthropic.Tool[] = [
  // ── Clients ───────────────────────────────────
  {
    name: 'search_clients',
    description: 'Search for clients by name or email. Returns matching clients with id, name, email, phone, location, status, and pipeline_stage. Call with no query to list all clients.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term to filter by name or email. Omit to list all.' },
      },
      required: [],
    },
  },
  {
    name: 'get_client',
    description: 'Get full details for a client by ID, including all their associated jobs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'create_client',
    description: 'Create a new client. Only name is required. If a client with the same name already exists, returns that one instead of making a duplicate. When the new client comes with a job to book, use create_job with new_client instead: one call, not two.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        contact_person: { type: 'string', description: 'The main person Arlo deals with at the client. Contracts name them, and they sign unless someone else is named.' },
        legal_name: { type: 'string', description: 'The legal name contracts use: a company as registered (ending in Limited), a sole trader as "Full Name trading as Trading Name", an individual by full name.' },
        entity_type: { type: 'string', enum: ['company', 'sole_trader', 'partnership', 'other_entity', 'individual'] },
        email: { type: 'string' },
        phone: { type: 'string' },
        location: { type: 'string' },
        lead_source: { type: 'string' },
        pipeline_stage: { type: 'string', enum: ['enquiry', 'discovery', 'proposal', 'negotiation', 'won', 'lost'] },
        status: { type: 'string', enum: ['lead', 'active', 'past', 'archived'] },
        client_category: { type: 'string', enum: ['video_ads', 'retainer', 'marketing', 'one_off'], description: 'Client type/category' },
        notes: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_client',
    description: 'Update an existing client. Provide client_id and any fields to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string' },
        name: { type: 'string' },
        contact_person: { type: 'string', description: 'The main person Arlo deals with at the client. Contracts name them, and they sign unless someone else is named.' },
        legal_name: { type: 'string', description: 'The legal name contracts use: a company as registered (ending in Limited), a sole trader as "Full Name trading as Trading Name", an individual by full name.' },
        entity_type: { type: 'string', enum: ['company', 'sole_trader', 'partnership', 'other_entity', 'individual'] },
        email: { type: 'string' },
        phone: { type: 'string' },
        location: { type: 'string' },
        lead_source: { type: 'string' },
        pipeline_stage: { type: 'string', enum: ['enquiry', 'discovery', 'proposal', 'negotiation', 'won', 'lost'] },
        status: { type: 'string', enum: ['lead', 'active', 'past', 'archived'] },
        client_category: { type: 'string', enum: ['video_ads', 'retainer', 'marketing', 'one_off'] },
        notes: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['client_id'],
    },
  },
  // ── Jobs ──────────────────────────────────────
  {
    name: 'search_jobs',
    description: 'Search for jobs by name, or filter by status/client. Matches against the JOB name only, not the client name — for "the Sky Automotive job" search client_id (from search_clients) or a distinctive word from the job name itself, not the client name. Returns id, name, status, job_type, shoot_date, quote_value, and client name. This is the only source of a real job_id — never construct or guess one.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term for job name' },
        status: { type: 'string', description: 'Filter by job status' },
        client_id: { type: 'string', description: 'Filter by client ID' },
      },
      required: [],
    },
  },
  {
    name: 'get_job',
    description: 'Get full job details including tasks, deliverables, and revisions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: "The job's real UUID, as returned by search_jobs or create_job. Never invent or guess one — if you don't already have it from an earlier call this turn, call search_jobs first." },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'create_job',
    description: 'Create a new job. Needs a name plus EITHER client_id (an existing client, from the roster in your context) OR new_client (a client not in the roster: it is created first, in the same call). Optionally specify job_type to auto-populate tasks from templates. If a job with essentially the same name already exists for this client (e.g. "July Content" when "Team Bainbridge — July Content" already exists), this returns a duplicate warning instead of creating it — check with Arlo whether he meant that existing job, then call again with confirm:true only if he really wants a second one.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        client_id: { type: 'string', description: 'Existing client UUID, straight from the roster in your context. Omit when using new_client.' },
        new_client: {
          type: 'object',
          description: 'For a client who is not in the roster yet. Created (or matched by name if they turn out to exist) before the job, so booking a brand new client is one call.',
          properties: {
            name: { type: 'string', description: 'The business name, not the contact person.' },
            contact_person: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            location: { type: 'string' },
            lead_source: { type: 'string' },
            pipeline_stage: { type: 'string', enum: ['enquiry', 'discovery', 'proposal', 'negotiation', 'won', 'lost'] },
            status: { type: 'string', enum: ['lead', 'active', 'past', 'archived'] },
            client_category: { type: 'string', enum: ['video_ads', 'retainer', 'marketing', 'one_off'] },
          },
          required: ['name'],
        },
        status: { type: 'string', enum: ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'live', 'delivered', 'handed_over', 'archived'], description: 'Defaults to enquiry. Use booked once the client has said yes ("lock it in", "confirmed", "go ahead").' },
        notes: { type: 'string', description: 'The brief in a few lines: what is being delivered, timing and turnaround, where it will be used, anything the client stressed. Write it so Arlo can shoot from it without reopening the email.' },
        job_type: { type: 'string', description: 'e.g. wedding, commercial, event, music_video' },
        shoot_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        shoot_location: { type: 'string' },
        quote_value: { type: 'number' },
        confirm: { type: 'boolean', description: 'Set true to create anyway after a duplicate warning and Arlo confirming he wants a second job with that name. Omit on the first attempt.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_job',
    description: 'Update job details. Provide job_id and fields to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        name: { type: 'string' },
        shoot_date: { type: 'string' },
        shoot_location: { type: 'string' },
        quote_value: { type: 'number' },
        notes: { type: 'string' },
        status: { type: 'string', enum: ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'live', 'delivered', 'handed_over', 'archived'] },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'update_job_status',
    description: 'Change a job\'s pipeline status. Also logs activity and creates a notification.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        status: { type: 'string', enum: ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'live', 'delivered', 'handed_over', 'archived'] },
      },
      required: ['job_id', 'status'],
    },
  },
  {
    name: 'delete_job',
    description: 'Delete a job by ID. This is permanent.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'toggle_task',
    description: 'Toggle a job task as completed or not completed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string' },
        completed: { type: 'boolean' },
      },
      required: ['task_id', 'completed'],
    },
  },

  // ── Todos ─────────────────────────────────────
  // The persona tells Arlo he can say "text me later about X", and buildSnapshot
  // feeds open_todos back every turn — but until now there was no way to WRITE
  // one. Tui could read the list and never add to it or close anything on it,
  // so the one thing it explicitly promised was the one thing it could not do.
  {
    name: 'list_todos',
    description: 'List Arlo\'s open todos — general reminders not tied to a job. Use this to find a todo\'s ID before completing it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_completed: { type: 'boolean', description: 'Include already-completed todos. Defaults to false.' },
      },
      required: [],
    },
  },
  {
    name: 'create_todo',
    description: 'Add a todo. Use this whenever Arlo asks to be reminded about something ("remind me to...", "text me later about..."). Without this the request is forgotten the moment the conversation moves on.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'What to remind him about, in his own words where possible.' },
        due_date: { type: 'string', description: 'ISO date or timestamp. Omit if he did not give one.' },
        linked_job_id: { type: 'string' },
        linked_client_id: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_todo',
    description: 'Mark a todo done. Use when Arlo says he has handled one. Get the ID from list_todos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        todo_id: { type: 'string' },
      },
      required: ['todo_id'],
    },
  },

  // ── Events ────────────────────────────────────
  {
    name: 'list_events',
    description: 'List calendar events. Optionally filter by date range or type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Defaults to today.' },
        to_date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Defaults to 30 days from now.' },
        event_type: { type: 'string', enum: ['shoot', 'meeting', 'deadline', 'personal'] },
      },
      required: [],
    },
  },
  {
    name: 'create_event',
    description: 'Create a new calendar event.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        event_type: { type: 'string', enum: ['shoot', 'meeting', 'deadline', 'personal'] },
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        start_time: { type: 'string', description: 'Time in HH:MM format' },
        end_time: { type: 'string', description: 'Time in HH:MM format' },
        notes: { type: 'string' },
        job_id: { type: 'string', description: 'Optional job ID to link this event to. The client is filled in from the job.' },
        client_id: { type: 'string', description: 'Optional client ID to link this event to when there is no job (a meeting with a client, say). Take it from the roster. Ignored if job_id is given.' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'update_event',
    description: 'Change a calendar event: its title, date, times, notes, or which client and job it is linked to. Use list_events to find the id. To link an existing event to a client or job, pass client_id and/or job_id; pass an empty string to unlink.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: { type: 'string' },
        title: { type: 'string' },
        event_type: { type: 'string', enum: ['shoot', 'meeting', 'deadline', 'personal'] },
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        start_time: { type: 'string', description: 'HH:MM' },
        end_time: { type: 'string', description: 'HH:MM' },
        notes: { type: 'string' },
        job_id: { type: 'string', description: 'Job to link, or "" to unlink. The client follows the job.' },
        client_id: { type: 'string', description: 'Client to link, or "" to unlink. Ignored if job_id is set.' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'log_shoot',
    description: 'Record that a shoot has happened. Use this whenever Arlo says he filmed, shot, or was out with a client ("did a shoot for Bainbridge today", "filmed Framers this morning", "shot the Johnson stuff on Tuesday"). Matches the client by name, dates it today unless told otherwise, links it to that month\'s job when one exists, and returns the client\'s running month tally so you can tell him where that leaves him. Do not use create_event for a shoot that has already happened.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Client name or part of it, e.g. "Bainbridge".' },
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD) the shoot happened. Defaults to today in NZ.' },
        notes: { type: 'string', description: 'What was filmed, or where. Optional but worth capturing if he said it.' },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: { type: 'string' },
      },
      required: ['event_id'],
    },
  },

  // ── Documents ─────────────────────────────────
  {
    name: 'list_documents',
    description: 'List all document templates.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_document',
    description: 'Save a plain written document (a brief, notes) with the text you pass. NEVER use it for a proposal or a contract: proposals are made with prepare_proposal then create_proposal, contracts with prepare_contract then create_contract. Never call it with empty content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        doc_type: { type: 'string', enum: ['contract', 'invoice', 'brief', 'other'] },
        content: { type: 'string', description: 'The full document text. Required.' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'prepare_contract',
    description: 'Step one of every new contract: pulls everything already known about the deal for this client (record, jobs with quotes and dates, existing contracts, recent emails) and returns ask_arlo_questions, the complete intake with the record\'s figures as the first options. Pass ask_arlo_questions to ask_arlo as ONE popup before drafting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'create_contract',
    description: "Draft and save a complete, lawyer-grade contract for a client. A specialist drafter writes the whole agreement from the terms you pass (it takes up to a minute or two), tailored to this deal, under New Zealand law, following Arlo's contract rules. It is saved into the CRM and shows in the client's portal. It is NOT emailed. Before calling, settle the commercial terms with Arlo using ask_arlo; pass every agreed fact in terms. Never invent a price, deposit, quantity, date, legal name or signatory. Every other gap (shoot length, turnaround, feedback and approval periods, invoice timing, reschedule notice, raw footage timing, storage period) the drafter fills with a default and lists in drafter_notes for Arlo to review.",
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID from the roster or search_clients.' },
        engagement_type: { type: 'string', enum: ['video_ad_project', 'monthly_retainer', 'event_coverage', 'photography', 'other'], description: 'What kind of deal this is. Shapes the whole agreement.' },
        brief: {
          type: 'object',
          description: 'Arlo\'s answer to every ask_arlo_questions item from prepare_contract, keyed by that question\'s key, word for word. Required: what, fee, payment, travel, start, ownership, portfolio, standard_terms, special_requests; plus cancellation for a one-off project, photography or other, and cancellation and event_hours for event coverage. The drafter refuses to run until these are all answered.',
          properties: {
            what: { type: 'string' }, fee: { type: 'string' }, payment: { type: 'string' }, travel: { type: 'string' }, start: { type: 'string' },
            ownership: { type: 'string' }, portfolio: { type: 'string' }, standard_terms: { type: 'string' },
            special_requests: { type: 'string' }, cancellation: { type: 'string' }, event_hours: { type: 'string' },
          },
        },
        terms: { type: 'string', description: 'Any other agreed facts not in the brief, one per line (shoot locations, dates, platforms, things from a pasted email thread).' },
        client_is_business: { type: 'boolean', description: 'True if the client is a business buying for business purposes (most clients). False for an individual or family (a wedding, a private person), which changes the consumer-law clauses.' },
        client_legal_name: { type: 'string', description: 'Only to override the legal_name on the client record. Normally save it with update_client and leave this out.' },
        client_entity_type: { type: 'string', enum: ['company', 'sole_trader', 'partnership', 'other_entity', 'individual'], description: 'Only to override the entity_type on the client record.' },
        signatory_name: { type: 'string', description: 'Only if someone other than the main contact on the client record signs.' },
        signatory_role: { type: 'string', description: 'Their role, e.g. "Director" or "Owner". Leave out for an individual.' },
        job_description: { type: 'string', description: 'One line for the cover, e.g. "Monthly social content retainer".' },
        shoot_date: { type: 'string', description: 'YYYY-MM-DD, for the cover, if there is one.' },
        date: { type: 'string', description: 'Contract date, YYYY-MM-DD. Defaults to today.' },
        location: { type: 'string' },
      },
      required: ['client_id', 'engagement_type', 'brief'],
    },
  },
  {
    name: 'update_contract',
    description: 'Change an existing contract that the client has not signed yet. For any wording or term change ("make payment 14 days", "add a clause about drone footage", "reschedule notice is 48 hours"), pass instructions and the drafter revises that same contract, changing only what was asked and keeping it consistent. Use this whenever Arlo is talking about a contract that already exists: never create a new one to make a change. Get the document_id from the contract you just made or from list_documents. Refuses once the client has signed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'string' },
        instructions: { type: 'string', description: 'The changes to make, in plain words, including any answers that fill a [blank] or change a default.' },
        client_is_business: { type: 'boolean', description: 'Defaults to true.' },
        job_description: { type: 'string' },
        shoot_date: { type: 'string', description: 'YYYY-MM-DD' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        location: { type: 'string' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'prepare_proposal',
    description: 'Step one of every proposal: pulls the client, the job (quote, dates, location, deliverables, notes), any existing proposal for it, and recent client emails, and returns ask_arlo_questions: the complete intake, the same checklist every time, with what the CRM already knows as the first option. Pass ask_arlo_questions to ask_arlo as ONE popup, then call create_proposal with every answer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string' },
        job_id: { type: 'string', description: 'The job this proposal is for, if known. Leave out and the intake asks which job.' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'create_proposal',
    description: 'Draft and save a client-facing proposal for a job, written in one pass by the specialist drafter (takes up to a minute). Saved as a draft on the job and NOT sent. Call it once, only after ask_arlo has collected every answer from prepare_proposal: it refuses while any required brief item is missing. The prices are yours to pass as price_lines and are never changed by the drafter.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
        price_lines: {
          type: 'array',
          minItems: 1,
          description: 'The priced lines exactly as agreed, NZD, no GST. One line for a single project fee, several if itemised or with add-ons. They must add up to the agreed price.',
          items: {
            type: 'object',
            properties: { description: { type: 'string', description: 'Short working label, the drafter rewrites it for the client.' }, amount: { type: 'number' } },
            required: ['description', 'amount'],
          },
        },
        brief: {
          type: 'object',
          description: 'Arlo\'s answer to every ask_arlo_questions item from prepare_proposal, keyed by that question\'s key, word for word, plus anything relevant from a pasted email thread. Required: goal, audience, platforms, deliverables, filming, timeline, price, price_layout, payment_terms, travel, inclusions, exclusions, angle, valid_for.',
          properties: {
            goal: { type: 'string' }, audience: { type: 'string' }, platforms: { type: 'string' }, deliverables: { type: 'string' },
            filming: { type: 'string' }, timeline: { type: 'string' }, price: { type: 'string' }, price_layout: { type: 'string' },
            payment_terms: { type: 'string' }, travel: { type: 'string' }, inclusions: { type: 'string' }, exclusions: { type: 'string' }, angle: { type: 'string' },
            valid_for: { type: 'string' }, extra_context: { type: 'string', description: 'Anything else from the thread or the client that should shape it.' },
          },
        },
        pricing_mode: { type: 'string', enum: ['total', 'options'], description: 'total (default): the price lines are added together into one total. options: the lines are alternative packages and the client picks ONE (for example 2 videos a month for $300 or 4 for $500, chosen again each month). Use options whenever Arlo or the thread says the client picks between packages; then no total is shown.' },
        price_suffix: { type: 'string', description: 'For options: what follows each price, usually "a month". Leave out for a one-off.' },
        replace_existing: { type: 'boolean', description: 'True only if Arlo said to redraft over an existing unsent proposal for this job.' },
      },
      required: ['job_id', 'price_lines', 'brief'],
    },
  },
  {
    name: 'update_proposal',
    description: 'Change an existing unsent proposal directly, without redrafting it (free and instant). Use for any edit Arlo asks for: a price, a line, the payment terms, an inclusion, a sentence in the cover note. Pass only the fields that change, written in full. Get the proposal_id from create_proposal or prepare_proposal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proposal_id: { type: 'string' },
        cover_note: { type: 'string' },
        services: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, amount: { type: 'number' } }, required: ['description', 'amount'] } },
        inclusions: { type: 'array', items: { type: 'string' } },
        payment_terms: { type: 'string' },
        pricing_mode: { type: 'string', enum: ['total', 'options'], description: 'Switch between adding the lines together (total) and the client picking one package (options).' },
        price_suffix: { type: 'string', description: 'For options, e.g. "a month".' },
      },
      required: ['proposal_id'],
    },
  },
  {
    name: 'ask_arlo',
    description: "Ask Arlo as many questions as the decision needs, answered by tapping an option in a popup instead of typing. A question only he can answer in his own words (a name, an email address, a phone number) has no options: he types it. Use it whenever you need decisions from him before acting, above all before drafting a contract or proposal, where prepare_contract / prepare_proposal hand you the complete question list to pass straight in. Make every question and option specific to this client and deal (use real names, the quoted price, the actual dates), put the option you would recommend first, and keep labels short. He can always type his own answer instead, so do not add an 'Other' option. Calling this ends your turn: his answers arrive as his next message. Say nothing else in the same turn beyond one short lead-in line.",
    input_schema: {
      type: 'object' as const,
      properties: {
        questions: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'One short, specific question.' },
              options: {
                type: 'array',
                description: 'Two to five answers to tap. Leave empty for a question he answers in his own words, such as an email address.',
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'The answer, short (a few words).' },
                    detail: { type: 'string', description: 'Optional one-line explanation of what choosing it means.' },
                  },
                  required: ['label'],
                },
              },
              multi: { type: 'boolean', description: 'True if he can pick more than one.' },
            },
            required: ['question'],
          },
        },
      },
      required: ['questions'],
    },
  },
  {
    name: 'delete_document',
    description: 'Delete a document by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        doc_id: { type: 'string' },
      },
      required: ['doc_id'],
    },
  },

  // ── Deliverables ──────────────────────────────
  {
    name: 'create_deliverable',
    description: 'Add a custom deliverable to a job. Use this when the user describes something they want tracked as a deliverable (e.g. "add a highlight reel deliverable to the Smith wedding job").',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: 'Job UUID. Search for the job first if needed.' },
        title: { type: 'string', description: 'Deliverable title, e.g. "5-Minute Highlight Reel"' },
        description: { type: 'string', description: 'Optional description of this deliverable' },
      },
      required: ['job_id', 'title'],
    },
  },
  {
    name: 'list_deliverables',
    description: 'List all deliverables for a job.',
    input_schema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string' },
      },
      required: ['job_id'],
    },
  },

  // ── Dashboard ─────────────────────────────────
  {
    name: 'get_dashboard_stats',
    description: 'Get summary statistics: active jobs, jobs awaiting review, revenue this month, leads in pipeline, upcoming events.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ── Subscriptions ─────────────────────────────
  // Arlo's own standing monthly bills (Claude, iCloud, Xero...), shown on the
  // dashboard. Not client money and not Xero: a list he keeps by telling Tui.
  {
    name: 'list_subscriptions',
    description: "List Arlo's active monthly subscriptions (his own bills, not client work): name, NZD amount, renewal day, and their ids for update or cancel.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'add_subscription',
    description: 'Add one of Arlo\'s own monthly subscriptions to the dashboard list. Amount is NZD per month as charged; day is the day of the month it renews. If he gives a price in another currency, ask for the NZD figure off his statement rather than converting it yourself.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'The service, e.g. "Adobe Creative Cloud".' },
        amount: { type: 'number', description: 'NZD per month.' },
        day: { type: 'integer', minimum: 1, maximum: 31, description: 'Day of the month it renews.' },
        note: { type: 'string', description: 'Optional short qualifier shown under the name, e.g. "Billed through WK Strawbridge".' },
      },
      required: ['name', 'amount', 'day'],
    },
  },
  {
    name: 'update_subscription',
    description: 'Change a subscription\'s name, amount, renewal day or note. Get the id from list_subscriptions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subscription_id: { type: 'string' },
        name: { type: 'string' },
        amount: { type: 'number' },
        day: { type: 'integer', minimum: 1, maximum: 31 },
        note: { type: 'string' },
      },
      required: ['subscription_id'],
    },
  },
  {
    name: 'cancel_subscription',
    description: 'Take a subscription off the dashboard list when Arlo has cancelled it. Kept on record as inactive, not deleted, so it can be restored. Get the id from list_subscriptions.',
    input_schema: {
      type: 'object' as const,
      properties: { subscription_id: { type: 'string' } },
      required: ['subscription_id'],
    },
  },

  // ── Memory ────────────────────────────────────
  // Standing facts Arlo tells Tui, shown back to it in context on every turn
  // and listed under Settings → Memory. See lib/ai-memory.ts.
  {
    name: 'remember',
    description: 'Save a standing fact Arlo has told you so you still know it in future conversations: how long things take him ("a reel takes about 1 hour to edit"), rates, client preferences, how he likes things done. Use it whenever he tells you something like that, or says "remember". One short fact per call, written in third person as a plain statement. Check the memories already in your context first: if one covers it, use update_memory instead of saving a duplicate. Never save one-off tasks or dates (those are todos or events).',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The fact, one sentence, e.g. "A short-form reel takes Arlo about 1 hour to edit."' },
        category: { type: 'string', enum: MEMORY_CATEGORY_KEYS, description: 'workflow = how long things take and how he works; pricing = rates and packages; client = about one specific client; preference = how he likes things done; business = gear, tools, the business itself.' },
        client_id: { type: 'string', description: 'Only for a client memory: the client id from the roster.' },
      },
      required: ['content', 'category'],
    },
  },
  {
    name: 'update_memory',
    description: 'Change a saved memory when Arlo corrects it ("actually reels take 90 minutes now"). The id is shown next to each memory in your context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memory_id: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string', enum: MEMORY_CATEGORY_KEYS },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'forget',
    description: 'Delete a saved memory when Arlo says it is no longer true or asks you to forget it. The id is shown next to each memory in your context.',
    input_schema: {
      type: 'object' as const,
      properties: { memory_id: { type: 'string' } },
      required: ['memory_id'],
    },
  },

  // ── Xero Finance ──────────────────────────────
  {
    name: 'list_xero_contacts',
    description: 'Search Xero contacts (clients/suppliers) by name. Use this to find the ContactID needed when creating invoices.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Name search term. Omit to list recent contacts.' },
      },
      required: [],
    },
  },
  {
    name: 'create_xero_invoice',
    description: "Create a sales invoice in Xero for a contact. Use list_xero_contacts first to get the ContactID. Look up the job (get_job, list_deliverables) before writing the line item — the invoice is what the client reads and it should say what they actually got, not the job's internal name. Creates as DRAFT unless approve is true. Creating never emails anything — send_xero_invoice does that.",
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'string', description: 'Xero ContactID (from list_xero_contacts)' },
        contact_name: { type: 'string', description: 'Contact display name (for confirmation)' },
        description: {
          type: 'string',
          description: 'Client-facing invoice line, written by you from the job and its deliverables — not the job name, and never asked of Arlo. See the invoicing rules in the system prompt.',
        },
        amount: { type: 'number', description: 'Amount excluding GST' },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD. Defaults to 14 days from today.' },
        reference: { type: 'string', description: 'Optional invoice reference/PO number' },
        approve: { type: 'boolean', description: 'If true, creates it already approved (status AUTHORISED) instead of DRAFT. This does NOT email it — use send_xero_invoice for that. Default false.' },
      },
      required: ['contact_id', 'contact_name', 'description', 'amount'],
    },
  },
  {
    name: 'list_xero_invoices',
    description: 'List outstanding (unpaid) Xero invoices — DRAFT, SUBMITTED, and AUTHORISED.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'approve_xero_invoice',
    description: 'Approve (authorise) a Xero invoice so it can be sent to the client. Use after create_xero_invoice if the user wants to send it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'string', description: 'Xero InvoiceID' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'send_xero_invoice',
    description: "Email an invoice to the client from Xero, using the org's own invoice template. Approves the invoice first if it is still a draft, so this is the one call needed to go from draft to sent. Arlo is asked to confirm before it actually sends. Fails with a reason if the Xero contact has no email address.",
    input_schema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'Xero InvoiceID' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'void_xero_invoice',
    description: 'Void an AUTHORISED (sent) Xero invoice. PERMANENT — Xero has no un-void. Fails if the invoice has payments allocated (those must be removed in Xero first). Only use when explicitly asked to void/cancel a specific invoice.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'string', description: 'Xero InvoiceID' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'delete_xero_invoice',
    description: 'Delete a DRAFT or SUBMITTED (not yet approved) Xero invoice. PERMANENT. For an AUTHORISED invoice, use void_xero_invoice instead — Xero does not allow hard-deleting sent invoices. Only use when explicitly asked to delete a specific invoice.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'string', description: 'Xero InvoiceID' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'get_xero_invoice_detail',
    description: 'Get full detail for one Xero invoice by ID, including any Payments allocated to it (PaymentID, amount, date). Use this before voiding/deleting an invoice that might have partial payments — Xero blocks the void/delete until those payments are removed first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'string', description: 'Xero InvoiceID' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'remove_xero_payment',
    description: 'Delete a payment allocated to a Xero invoice, freeing the invoice to be voided or deleted. PERMANENT — also un-reconciles the underlying bank transaction if it was matched (the money isn\'t lost, it just needs re-matching in Xero afterward). Get the payment_id from get_xero_invoice_detail first. Only use when explicitly asked to remove/unallocate a payment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        payment_id: { type: 'string', description: 'Xero PaymentID' },
      },
      required: ['payment_id'],
    },
  },
  {
    name: 'update_xero_invoice',
    description: 'Edit a DRAFT Xero invoice — amount, description, due date, or reference. Only works before the invoice is approved/sent.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'string', description: 'Xero InvoiceID' },
        description: { type: 'string', description: 'New line item description. Same bar as on create_xero_invoice: specific and client-facing, not just the job name.' },
        amount: { type: 'number', description: 'New amount excluding GST' },
        due_date: { type: 'string', description: 'New due date YYYY-MM-DD' },
        reference: { type: 'string', description: 'New invoice reference/PO number' },
      },
      required: ['invoice_id'],
    },
  },

  // ── Email (hello@tuimedia.nz, read-only) ───────
  {
    name: 'list_recent_emails',
    description: 'List recent inbox emails for hello@tuimedia.nz — subject, sender, date, read/flagged status. Read-only: never marks anything as read. Use unread_only to see only what hasn\'t been opened yet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max emails to return. Default 15.' },
        unread_only: { type: 'boolean', description: 'If true, only return unread emails. Default false.' },
      },
      required: [],
    },
  },

  // ── Retainer content backlog ──────────────────
  {
    name: 'get_content_backlog',
    description: 'How far behind Arlo is on retainer content, measured by videos actually uploaded to the client portal rather than job status. Returns per-client month-by-month history: videos expected vs uploaded, which past months still owe videos, and whether a month\'s job was ever created at all. Use this for any question about being behind, catching up, what he owes a retainer client, or how a month is tracking. Far more reliable than job status or the deliverable completed flag, neither of which reflects real progress.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Optional — filter to one retainer client by name (partial match is fine).' },
      },
      required: [],
    },
  },

  // ── Assistant flags ───────────────────────────
  // Arlo's controls over his own notification stream. Without these, "not now"
  // has nowhere to live: the model would agree in the chat and then raise the
  // same thing again on the next tick, because agreement is not state.
  {
    name: 'snooze_flag',
    description: 'Stop raising one flagged concern for a while. Use this when Arlo says "not now", "leave it", "I know", or "remind me next week" about something you flagged. The concern stays tracked and comes back when the snooze expires.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'The exact key from flags_worth_raising.' },
        days: { type: 'number', description: 'How many days to stay quiet about it. Default 7.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'resolve_flag',
    description: 'Mark a flagged concern as dealt with, when Arlo tells you it is done but the CRM does not show it yet. Prefer fixing the underlying record (update_job_status, toggle_task) when you can, because the sweep resolves flags on its own from real data. Use this only when there is nothing to update.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'The exact key from flags_worth_raising.' },
      },
      required: ['key'],
    },
  },
]

// ── Tool Executor ──────────────────────────────────────────────────────────────

// Exact name match, ignoring case and surrounding space. Deliberately not
// fuzzy: "Sky" must not swallow "Sky Automotive".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findClientByName(supabase: any, name: string): Promise<{ id: string; name: string } | null> {
  const clean = (name ?? '').trim()
  if (!clean) return null
  const escaped = clean.replace(/[\\%_]/g, (c) => '\\' + c)
  const { data } = await supabase.from('clients').select('id, name').ilike('name', escaped).limit(1)
  return data?.[0] ?? null
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: ExecuteToolOptions = {}
): Promise<string> {
  // Enforced before the switch, so every destructive branch is covered by
  // construction — including any added later, as long as its name is listed
  // in CONFIRM_TOOLS.
  if (CONFIRM_TOOLS.has(name)) {
    const fingerprint = toolFingerprint(name, input)
    if (!opts.approvals?.includes(fingerprint)) {
      // Returned as a normal tool_result so the model reads it and relays the
      // question, rather than throwing and losing the turn.
      return JSON.stringify({
        status: 'confirmation_required',
        fingerprint,
        action: await describeAction(name, input, supabase),
        tone: confirmTone(name),
        instruction:
          'NOT executed yet. Arlo now has a button showing exactly what will happen, so do not restate it and never quote an id. Say one short line, like "Ready to send, tap Send.", and stop. Do not retry this tool until he has confirmed. ' +
          'Once he does confirm (he taps Confirm, or says yes), you MUST call this exact tool again with these exact arguments — that second call is the only thing that actually performs the action. Approving does not run it for you, and answering "sending it now" without making the call means nothing happens at all.',
      })
    }
  }

  switch (name) {
    // ── Clients ─────────────────────────────
    case 'search_clients': {
      let query = supabase.from('clients').select('id, name, email, phone, location, status, pipeline_stage, tags, notes')
      const search = input.query as string | undefined
      if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
      const { data, error } = await query.order('name').limit(50)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ clients: data })
    }

    case 'get_client': {
      const { data, error } = await supabase
        .from('clients')
        .select('*, jobs(id, name, status, job_type, shoot_date, quote_value)')
        .eq('id', input.client_id as string)
        .single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ client: data })
    }

    case 'create_client': {
      // A retried turn (the first reply never arrived) used to make a second
      // copy of the client. Same name means same client.
      const existing = await findClientByName(supabase, input.name as string)
      if (existing) return JSON.stringify({ success: true, existing: true, client: existing, note: 'A client with this name already exists, so no new one was created. Use this id.' })

      const { data, error } = await supabase.from('clients').insert({
        name: input.name as string,
        contact_person: (input.contact_person as string) || null,
        legal_name: (input.legal_name as string) || null,
        entity_type: (input.entity_type as string) || null,
        email: (input.email as string) || null,
        phone: (input.phone as string) || null,
        location: (input.location as string) || null,
        lead_source: (input.lead_source as string) || null,
        pipeline_stage: (input.pipeline_stage as string) || 'enquiry',
        status: (input.status as string) || 'lead',
        client_category: (input.client_category as string) || null,
        notes: (input.notes as string) || null,
        tags: input.tags ? JSON.stringify(input.tags) : null,
      }).select('id, name').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, client: data })
    }

    case 'update_client': {
      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates.name = input.name
      if (input.contact_person !== undefined) updates.contact_person = input.contact_person || null
      if (input.legal_name !== undefined) updates.legal_name = input.legal_name || null
      if (input.entity_type !== undefined) updates.entity_type = input.entity_type || null
      if (input.email !== undefined) updates.email = input.email || null
      if (input.phone !== undefined) updates.phone = input.phone || null
      if (input.location !== undefined) updates.location = input.location || null
      if (input.lead_source !== undefined) updates.lead_source = input.lead_source || null
      if (input.pipeline_stage !== undefined) updates.pipeline_stage = input.pipeline_stage
      if (input.status !== undefined) updates.status = input.status
      if (input.client_category !== undefined) updates.client_category = input.client_category || null
      if (input.notes !== undefined) updates.notes = input.notes || null
      if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags)

      const { data, error } = await supabase.from('clients').update(updates).eq('id', input.client_id as string).select('id, name').single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true, client: data })
    }

    case 'delete_client': {
      return JSON.stringify({ error: 'Client deletion is not allowed via AI. Please delete clients manually from their profile page.' })
    }

    // ── Jobs ────────────────────────────────
    case 'search_jobs': {
      let query = supabase.from('jobs').select('id, name, status, job_type, shoot_date, shoot_location, quote_value, client_id, clients(name)')
      if (input.query) query = query.ilike('name', `%${input.query}%`)
      if (input.status) query = query.eq('status', input.status as string)
      if (input.client_id) query = query.eq('client_id', input.client_id as string)
      const { data, error } = await query.order('created_at', { ascending: false }).limit(50)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ jobs: data })
    }

    case 'get_job': {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, clients(name, email, phone), job_tasks(id, phase, title, completed, sort_order), deliverables(id, title, completed), revisions(id, round, request, status)')
        .eq('id', input.job_id as string)
        .single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ job: data })
    }

    case 'create_job': {
      // A brand new client and their first job in one call. Creating the
      // client as its own tool call cost a whole extra model round (~1.5s)
      // between "create the client" and "now create the job", for no reason
      // other than the job needing the id.
      let clientCreated: { id: string; name: string } | null = null
      if (!input.client_id && input.new_client) {
        const nc = input.new_client as Record<string, unknown>
        const existing = await findClientByName(supabase, nc.name as string)
        if (existing) {
          input.client_id = existing.id
        } else {
          const { data, error } = await supabase.from('clients').insert({
            name: nc.name as string,
            contact_person: (nc.contact_person as string) || null,
            email: (nc.email as string) || null,
            phone: (nc.phone as string) || null,
            location: (nc.location as string) || null,
            lead_source: (nc.lead_source as string) || null,
            pipeline_stage: (nc.pipeline_stage as string) || 'enquiry',
            status: (nc.status as string) || 'lead',
            client_category: (nc.client_category as string) || null,
          }).select('id, name').single()
          if (error) return JSON.stringify({ error: `Could not create the client: ${error.message}` })
          clientCreated = data
          input.client_id = data.id
        }
      }
      if (!input.client_id) return JSON.stringify({ error: 'create_job needs client_id (an existing client) or new_client (a new one).' })

      if (!input.confirm) {
        const dup = await findDuplicateJobName(supabase, input.client_id as string, input.name as string)
        if (dup) return JSON.stringify({ error: `A job called "${dup.name}" already exists for this client (status: ${dup.status}). Ask Arlo whether he meant that one, or call create_job again with confirm:true if he really wants a second job with this name.`, duplicate_job_id: dup.id })
      }

      const { data: job, error } = await supabase.from('jobs').insert({
        name: input.name as string,
        client_id: input.client_id as string,
        job_type: (input.job_type as string) || null,
        shoot_date: input.shoot_date ? new Date(input.shoot_date as string).toISOString() : null,
        shoot_location: (input.shoot_location as string) || null,
        quote_value: input.quote_value != null ? Number(input.quote_value) : null,
        status: (input.status as string) || 'enquiry',
        notes: (input.notes as string) || null,
      }).select('id, name').single()

      if (error) return JSON.stringify({ error: error.message, ...(clientCreated ? { client_created: clientCreated, note: 'The client was created; only the job failed. Do not create the client again.' } : {}) })

      // Everything after the job row is independent, so it goes in one
      // concurrent wave. Template tasks used to be inserted one await at a
      // time: 30 sequential round trips (~4s) for a video_ads job.
      const template = input.job_type
        ? (await supabase
            .from('job_templates')
            .select('id, template_tasks(phase, title, sort_order), template_deliverables(title, description)')
            .eq('job_type', input.job_type as string)
            .maybeSingle()).data
        : null
      const tasks = (template?.template_tasks ?? []) as { phase: string; title: string; sort_order: number }[]
      const delivs = (template?.template_deliverables ?? []) as { title: string; description: string | null }[]

      await Promise.all([
        tasks.length ? supabase.from('job_tasks').insert(tasks.map((t) => ({ job_id: job.id, phase: t.phase, title: t.title, sort_order: t.sort_order }))) : null,
        delivs.length ? supabase.from('deliverables').insert(delivs.map((d) => ({ job_id: job.id, title: d.title, description: d.description }))) : null,
        supabase.from('activities').insert({
          action: 'job_created',
          details: `Job "${input.name}" created`,
          job_id: job.id,
          client_id: input.client_id as string,
        }),
        // Same mirror the dashboard uses. A shoot Tui books over Telegram has
        // to land on the calendar too, or the two surfaces disagree about the
        // one date that cannot move.
        syncShootEvent(supabase, job.id),
      ])

      return JSON.stringify({ success: true, job, ...(clientCreated ? { client: clientCreated } : {}) })
    }

    case 'update_job': {
      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates.name = input.name
      if (input.shoot_date !== undefined) updates.shoot_date = input.shoot_date ? new Date(input.shoot_date as string).toISOString() : null
      if (input.shoot_location !== undefined) updates.shoot_location = input.shoot_location || null
      if (input.quote_value !== undefined) updates.quote_value = input.quote_value != null ? Number(input.quote_value) : null
      if (input.notes !== undefined) updates.notes = input.notes || null
      if (input.status !== undefined) updates.status = input.status
      // Revenue is bucketed by delivered_at — stamp it on the delivery transition.
      if (input.status === 'delivered') updates.delivered_at = new Date().toISOString()

      const { data, error } = await supabase.from('jobs').update(updates).eq('id', input.job_id as string).select('id, name').single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })

      if (input.status) {
        await supabase.from('activities').insert({
          action: 'status_changed',
          details: `Status changed to ${input.status}`,
          job_id: input.job_id as string,
        })
      }

      await syncShootEvent(supabase, input.job_id as string)

      return JSON.stringify({ success: true, job: data })
    }

    case 'update_job_status': {
      const { data: job } = await supabase.from('jobs').select('client_id, name, status').eq('id', input.job_id as string).single()
      if (!job) return JSON.stringify({ error: 'Job not found' })

      await supabase.from('jobs').update({
        status: input.status as string,
        ...(input.status === 'delivered' && job.status !== 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
      }).eq('id', input.job_id as string)
      await supabase.from('activities').insert({ action: 'status_changed', details: `Status changed to ${input.status}`, job_id: input.job_id as string, client_id: job.client_id })
      await supabase.from('notifications').insert({ title: 'Job Status Updated', message: `"${job.name}" is now ${input.status}`, type: 'status_change', job_id: input.job_id as string, client_id: job.client_id })

      return JSON.stringify({ success: true })
    }

    case 'delete_job': {
      // Before the row goes — events.job_id is ON DELETE SET NULL, so the
      // shoot would otherwise survive its job as an orphan on the calendar.
      await removeShootEvent(supabase, input.job_id as string)
      const { error } = await supabase.from('jobs').delete().eq('id', input.job_id as string)
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true })
    }

    case 'toggle_task': {
      const { error } = await supabase.from('job_tasks').update({ completed: input.completed as boolean }).eq('id', input.task_id as string)
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true })
    }

    // ── Todos ───────────────────────────────
    case 'list_todos': {
      let q = supabase.from('todos').select('id, title, completed, due_date, created_at')
      if (!input.include_completed) q = q.eq('completed', false)
      const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false }).limit(50)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ todos: data })
    }

    case 'create_todo': {
      const { data, error } = await supabase
        .from('todos')
        .insert({
          title: input.title as string,
          due_date: (input.due_date as string) || null,
          linked_job_id: (input.linked_job_id as string) || null,
          linked_client_id: (input.linked_client_id as string) || null,
        })
        .select('id, title, due_date')
        .single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, todo: data })
    }

    case 'complete_todo': {
      const { error } = await supabase.from('todos').update({ completed: true }).eq('id', input.todo_id as string)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true })
    }

    // ── Events ──────────────────────────────
    case 'list_events': {
      const fromDate = (input.from_date as string) || new Date().toISOString().split('T')[0]
      const toDate = (input.to_date as string) || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

      let query = supabase.from('events').select('id, title, event_type, date, start_time, end_time, notes, job_id, client_id, jobs(name), clients(name)')
        .gte('date', fromDate)
        .lte('date', toDate)

      if (input.event_type) query = query.eq('event_type', input.event_type as string)

      const { data, error } = await query.order('date').order('start_time')
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ events: data })
    }

    case 'create_event': {
      // Carry the client through from the job when there is one, so a shoot
      // booked ahead of time counts toward that client's month the same way a
      // shoot logged after the fact does.
      const eventJobId = (input.job_id as string) || null
      let eventClientId: string | null = (input.client_id as string) || null
      if (eventJobId) {
        const { data: parentJob } = await supabase.from('jobs').select('client_id').eq('id', eventJobId).maybeSingle()
        eventClientId = (parentJob as { client_id: string | null } | null)?.client_id ?? eventClientId
      }

      const { data, error } = await supabase.from('events').insert({
        title: input.title as string,
        event_type: (input.event_type as string) || 'personal',
        date: new Date(input.date as string).toISOString(),
        start_time: (input.start_time as string) || null,
        end_time: (input.end_time as string) || null,
        notes: (input.notes as string) || null,
        job_id: eventJobId,
        client_id: eventClientId,
      }).select('id, title, date').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, event: data })
    }

    // Logging a shoot after the fact, which is the only way a second shoot in
    // one month gets recorded at all: jobs.shoot_date holds exactly one date,
    // so a month job cannot represent two filming days. The event carries the
    // client directly for that reason.
    case 'update_event': {
      const updates: Record<string, unknown> = {}
      if (input.title !== undefined) updates.title = String(input.title)
      if (input.event_type !== undefined) updates.event_type = String(input.event_type)
      if (input.date !== undefined) updates.date = new Date(input.date as string).toISOString()
      if (input.start_time !== undefined) updates.start_time = (input.start_time as string) || null
      if (input.end_time !== undefined) updates.end_time = (input.end_time as string) || null
      if (input.notes !== undefined) updates.notes = (input.notes as string) || null
      if (input.job_id !== undefined) {
        const jobId = (input.job_id as string) || null
        updates.job_id = jobId
        if (jobId) {
          const { data: parentJob } = await supabase.from('jobs').select('client_id').eq('id', jobId).maybeSingle()
          if (parentJob?.client_id) updates.client_id = parentJob.client_id
        } else if (input.client_id === undefined) {
          updates.client_id = null
        }
      }
      if (input.client_id !== undefined && updates.client_id === undefined) updates.client_id = (input.client_id as string) || null
      if (Object.keys(updates).length === 0) return JSON.stringify({ error: 'Nothing to change.' })
      const { data, error } = await supabase.from('events').update(updates).eq('id', input.event_id as string)
        .select('id, title, date, job_id, client_id, jobs(name), clients(name)').single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true, event: data })
    }

    case 'log_shoot': {
      const query = (input.client_name as string).trim()
      const { data: matches, error: clientError } = await supabase
        .from('clients')
        .select('id, name, shoots_per_month')
        .ilike('name', `%${query}%`)
        .neq('status', 'archived')
        .limit(5)

      if (clientError) return JSON.stringify({ error: clientError.message })
      if (!matches || matches.length === 0) {
        return JSON.stringify({ error: `No client matching "${query}".` })
      }
      // Ambiguity is Arlo's to resolve, not something to guess at — logging a
      // shoot against the wrong client silently corrupts that client's month.
      if (matches.length > 1) {
        return JSON.stringify({
          error: `"${query}" matches ${matches.length} clients: ${matches.map((c: { name: string }) => c.name).join(', ')}. Ask which one before logging.`,
        })
      }

      const client = matches[0] as { id: string; name: string; shoots_per_month: number | null }
      const todayNZ = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
      const shootDate = (input.date as string | undefined)?.trim() || todayNZ
      if (!/^\d{4}-\d{2}-\d{2}$/.test(shootDate)) {
        return JSON.stringify({ error: `date must be YYYY-MM-DD, got "${shootDate}".` })
      }
      const monthKeyForShoot = shootDate.slice(0, 7)

      // Link it to that month's job when there is one, so the shoot shows on
      // the job record too. No job is not an error: the shoot still happened,
      // and it still counts toward the month.
      const { data: clientJobs } = await supabase
        .from('jobs')
        .select('id, name, created_at')
        .eq('client_id', client.id)

      const monthJob = ((clientJobs ?? []) as { id: string; name: string; created_at: string | null }[])
        .find((j) => {
          const parsed = parseJobMonth(j.name, j.created_at)
          if (!parsed) return false
          return `${parsed.year}-${String(parsed.monthIdx + 1).padStart(2, '0')}` === monthKeyForShoot
        }) ?? null

      const { data: event, error: eventError } = await supabase.from('events').insert({
        client_id: client.id,
        job_id: monthJob?.id ?? null,
        title: monthJob ? `${client.name} — ${monthJob.name}` : `${client.name} — shoot`,
        event_type: 'shoot',
        date: new Date(`${shootDate}T00:00:00+12:00`).toISOString(),
        notes: (input.notes as string) || null,
      }).select('id, title, date').single()

      if (eventError) {
        // The most likely cause by far is migration_shoot_log.sql not having
        // been run, and "column does not exist" means nothing to Arlo.
        const hint = /client_id/.test(eventError.message)
          ? ' Looks like supabase/migration_shoot_log.sql has not been run yet — tell Arlo that is what is blocking it.'
          : ''
        return JSON.stringify({ error: eventError.message + hint })
      }

      // Hand back the month's real state so the reply can be specific about
      // where this leaves him rather than just confirming the write.
      const backlog = await getContentBacklog(supabase).catch(() => null)
      const entry = backlog?.clients.find((c) => c.clientId === client.id) ?? null
      const month = entry?.months.find((m) => m.month === monthKeyForShoot) ?? null

      return JSON.stringify({
        success: true,
        logged: { client: client.name, date: shootDate, linked_job: monthJob?.name ?? null, event_id: event.id },
        month_now: month
          ? {
              month: month.label,
              shoots_logged: month.shoots,
              shoots_target: client.shoots_per_month,
              videos_uploaded: month.uploaded,
              videos_expected: month.expected,
              job_exists: month.jobExists,
            }
          : { month: monthKeyForShoot, note: 'No retainer month tracked for this client, so the shoot is logged but not counted against a quota.' },
      })
    }

    case 'delete_event': {
      const { error } = await supabase.from('events').delete().eq('id', input.event_id as string)
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true })
    }

    // ── Documents ───────────────────────────
    case 'list_documents': {
      const { data, error } = await supabase.from('documents').select('id, name, doc_type, created_at, updated_at').order('updated_at', { ascending: false })
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ documents: data })
    }

    case 'create_document': {
      // A blank "Proposal" or "Contract" document is what a wrong turn used to
      // leave behind: an empty row on the Documents page. Both have their own
      // flow that gathers the facts first, so route them there.
      const docName = String(input.name ?? '')
      if (/proposal/i.test(docName)) return JSON.stringify({ error: 'Not saved. A proposal is not a document. Call prepare_proposal for the client and job, ask Arlo its questions in one ask_arlo popup, then create_proposal.' })
      if (/contract|agreement/i.test(docName) || input.doc_type === 'contract') return JSON.stringify({ error: 'Not saved. A contract is not made here. Call prepare_contract for the client, ask Arlo its questions in one ask_arlo popup, then create_contract.' })
      if (!String(input.content ?? '').trim()) return JSON.stringify({ error: 'Not saved: a document needs its text. Write the content and call this again.' })
      const { data, error } = await supabase.from('documents').insert({
        name: input.name as string,
        doc_type: (input.doc_type as string) || 'contract',
        content: (input.content as string) || '',
      }).select('id, name').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, document: data })
    }

    case 'prepare_contract': {
      const clientId = input.client_id as string
      const [client, jobs, docs, emails] = await Promise.all([
        supabase.from('clients').select('name, legal_name, entity_type, contact_person, email, phone, location, status, client_category, monthly_retainer, shoots_per_month, videos_per_month, retainer_paused_from, notes').eq('id', clientId).single(),
        supabase.from('jobs').select('id, name, status, job_type, shoot_date, shoot_location, quote_value, notes').eq('client_id', clientId).order('created_at', { ascending: false }).limit(8),
        supabase.from('documents').select('id, name, created_at, content').eq('client_id', clientId).eq('doc_type', 'contract').order('created_at', { ascending: false }).limit(5),
        supabase.from('client_emails').select('subject, heading, summary, received_at').eq('client_id', clientId).order('received_at', { ascending: false }).limit(5),
      ])
      if (client.error || !client.data) return JSON.stringify({ error: client.error ? dbErrorMessage(client.error) : 'No such client.' })
      const contracts = (docs.data ?? []).map((d: { id: string; name: string; created_at: string; content: string }) => {
        let form: Record<string, unknown> = {}
        try { form = JSON.parse(d.content)?.form ?? {} } catch { /* free text */ }
        const body = String(form.body ?? '')
        return {
          document_id: d.id,
          name: d.name,
          created: d.created_at.slice(0, 10),
          signed: Boolean(form.clientSignature),
          project: form.jobDescription || null,
          // Enough of the wording to see what was agreed last time, not the whole thing.
          opening: body.slice(0, 900),
          unfilled_blanks: unfilledPlaceholders(body),
        }
      })
      // The contract names these, so whatever the record lacks gets asked in
      // the same popup as the terms and saved back to the client.
      const c = client.data as Record<string, unknown>
      const missing = ['legal_name', 'entity_type', 'contact_person', 'email', 'phone', 'location'].filter((k) => !c[k])
      const questions = buildContractIntake(client.data, jobs.data ?? [], missing)
      const unsigned = contracts.filter((k: { signed: boolean }) => !k.signed)
      if (unsigned.length) {
        questions.unshift({ key: 'existing', question: `There's an unsigned contract for ${client.data.name} from ${unsigned[0].created}. Revise that one or start fresh?`, options: [{ label: 'Revise the existing one' }, { label: 'Start a new contract' }] })
      }
      return JSON.stringify({
        client: client.data,
        jobs: jobs.data ?? [],
        existing_contracts: contracts,
        recent_client_emails: emails.data ?? [],
        already_in_every_contract: SETTLED_CONTRACT_TERMS,
        ask_arlo_questions: questions,
        guidance: 'Call ask_arlo ONCE with ask_arlo_questions as they are (you may sharpen the wording with names from the record or a pasted thread, and drop a question only if Arlo already answered it in this conversation). Do not add small questions of your own and do not split it into several popups. When the answers come back: save any client details with update_client, then call create_contract once with brief keyed by each question key, his answers word for word. If an answer is "Change some" or "Yes" with nothing typed, ask one short follow-up popup about just that before drafting.',
      })
    }

    case 'create_contract': {
      const { data: client, error: clientError } = await supabase.from('clients').select('id, name, legal_name, entity_type, contact_person, email, phone, location, portal_token').eq('id', input.client_id as string).single()
      if (clientError || !client) return JSON.stringify({ error: clientError ? dbErrorMessage(clientError) : 'No such client.' })

      // One draft, built on a complete brief. Anything unanswered is asked
      // first rather than left to a default that then needs a second draft.
      const engagement = String(input.engagement_type ?? 'other')
      const brief = (input.brief ?? {}) as Record<string, unknown>
      const gaps = missingBriefKeys(brief, contractRequiredKeys(engagement))
      if (gaps.length) {
        return JSON.stringify({ error: `NOT drafted. The brief is missing: ${gaps.join(', ')}. Call prepare_contract, ask Arlo those questions in one ask_arlo popup, then call create_contract again with every answer in brief.` })
      }
      const terms = [briefLines(brief), String(input.terms ?? '').trim()].filter(Boolean).join('\n')

      // The parties clause and the signature block print these, so a guess
      // would put the wrong entity or person on a signed contract. They come
      // off the client record, which Tui fills by asking first.
      const legalName = String(input.client_legal_name || client.legal_name || '').trim()
      const entityType = String(input.client_entity_type || client.entity_type || '') as NonNullable<ContractParties['clientEntityType']> | ''
      const signatoryName = String(input.signatory_name || client.contact_person || '').trim()
      const missing = [
        !legalName && 'legal name',
        !entityType && 'company or sole trader',
        !signatoryName && 'main contact (who signs)',
        !client.email && 'email',
      ].filter(Boolean)
      if (missing.length) {
        return JSON.stringify({ error: `The client record is missing: ${missing.join(', ')}. Ask Arlo for them with ask_arlo, save them with update_client, then call create_contract again. Do not guess.` })
      }

      // The whole agreement is drafted fresh for this deal. There is no
      // "use the template as it stands" path any more: that path is how every
      // contract kept coming back as the same five-section video-ads template.
      const today = new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })
      const documentNumber = await nextDocumentNumber(supabase)
      const drafted = await draftContract({
        parties: {
          clientName: client.name,
          clientLegalName: legalName,
          clientEntityType: entityType || null,
          signatoryName,
          signatoryRole: typeof input.signatory_role === 'string' ? input.signatory_role : null,
          contactPerson: client.contact_person,
          clientEmail: client.email,
          clientPhone: client.phone,
          clientLocation: client.location,
          clientIsBusiness: input.client_is_business !== false,
        },
        terms: `Engagement type: ${String(input.engagement_type ?? 'other').replace(/_/g, ' ')}\n${terms}`,
        today,
      })
      if ('error' in drafted) return JSON.stringify({ error: drafted.error })

      // clientName and contactPerson are what the PDF's signature block prints:
      // the legal entity, and the named person signing for it.
      const form = {
        clientName: legalName,
        contactPerson: signatoryName,
        clientEmail: client.email || '',
        clientPhone: client.phone || '',
        businessName: client.name,
        date: (input.date as string) || new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }),
        jobDescription: (input.job_description as string) || '',
        shootDate: (input.shoot_date as string) || '',
        location: (input.location as string) || client.location || '',
        body: drafted.body,
        clientSignature: '',
        clientSignedAt: '',
        documentNumber,
      }
      const docName = `Contract - ${client.name}`
      const { data: doc, error } = await supabase.from('documents').insert({
        name: docName,
        doc_type: 'contract',
        content: JSON.stringify({ template: 'Contract', form }),
        client_id: client.id,
      }).select('id').single()
      if (error || !doc) return JSON.stringify({ error: error?.message || 'Could not save the contract.' })

      // A legal name or entity type passed in here is kept on the client too,
      // so the next contract does not ask again.
      const clientPatch: Record<string, unknown> = {}
      if (!client.portal_token) clientPatch.portal_token = crypto.randomUUID()
      if (legalName !== client.legal_name) clientPatch.legal_name = legalName
      if (entityType !== client.entity_type) clientPatch.entity_type = entityType
      await Promise.all([
        Object.keys(clientPatch).length ? supabase.from('clients').update(clientPatch).eq('id', client.id) : null,
        supabase.from('activities').insert({ action: 'document_created', details: `Contract "${docName}" created for ${client.name}`, client_id: client.id }),
      ])
      return JSON.stringify({
        success: true,
        document: { id: doc.id, name: docName },
        document_number: documentNumber,
        unfilled_blanks: unfilledPlaceholders(drafted.body),
        drafter_notes: drafted.notes,
        note: 'Saved and visible in the client portal. Not emailed. If there are blanks, offer to fill them with ask_arlo and then update_contract on THIS document_id.',
      })
    }

    case 'update_contract': {
      const { data: doc, error: docError } = await supabase.from('documents').select('id, name, content, client_id').eq('id', input.document_id as string).single()
      if (docError || !doc) return JSON.stringify({ error: docError ? dbErrorMessage(docError) : 'No such document.' })
      let parsed: { template?: string; form?: Record<string, unknown> }
      try { parsed = JSON.parse(doc.content) } catch { return JSON.stringify({ error: 'That document is free text, not a structured contract, so it cannot be edited this way.' }) }
      if (!parsed?.form) return JSON.stringify({ error: 'That document has no contract fields to edit.' })
      if (parsed.form.clientSignature) return JSON.stringify({ error: 'The client has already signed this contract, so it is locked. Create a new contract instead.' })

      const form = { ...parsed.form }
      let notes = ''
      const instructions = typeof input.instructions === 'string' ? input.instructions.trim() : ''
      if (instructions) {
        const today = new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })
        const revised = await reviseContract({
          currentBody: String(form.body ?? ''),
          instructions,
          parties: { clientName: String(form.clientName ?? ''), clientIsBusiness: input.client_is_business !== false },
          today,
        })
        if ('error' in revised) return JSON.stringify({ error: revised.error })
        form.body = revised.body
        notes = revised.notes
      }
      if (typeof input.job_description === 'string') form.jobDescription = input.job_description
      if (typeof input.shoot_date === 'string') form.shootDate = input.shoot_date
      if (typeof input.date === 'string') form.date = input.date
      if (typeof input.location === 'string') form.location = input.location

      const { error } = await supabase.from('documents').update({ content: JSON.stringify({ ...parsed, form }) }).eq('id', doc.id)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, document: { id: doc.id, name: doc.name }, unfilled_blanks: unfilledPlaceholders(String(form.body ?? '')), drafter_notes: notes })
    }

    case 'ask_arlo': {
      // Rendered as a popup by the dashboard chat, which intercepts this call
      // before it gets here. Reaching the executor means a surface without
      // popups (Telegram), where the tool is not offered in the first place.
      return JSON.stringify({ error: 'Questions with options only work in the dashboard chat. Ask in plain text instead.' })
    }

    case 'delete_document': {
      const { error } = await supabase.from('documents').delete().eq('id', input.doc_id as string)
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true })
    }

    // ── Deliverables ────────────────────────
    case 'create_deliverable': {
      const { data, error } = await supabase.from('deliverables').insert({
        job_id: input.job_id as string,
        title: input.title as string,
        description: (input.description as string) || null,
      }).select('id, title').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, deliverable: data })
    }

    case 'list_deliverables': {
      const { data, error } = await supabase
        .from('deliverables')
        .select('id, title, description, completed')
        .eq('job_id', input.job_id as string)
        .order('created_at')
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ deliverables: data })
    }

    // ── Dashboard ───────────────────────────
    // ── Subscriptions ───────────────────────
    case 'list_subscriptions': {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, name, amount, day, note')
        .eq('active', true)
        .order('day')
      if (error) return JSON.stringify({ error: error.message })
      const rows = (data ?? []).map((r: { amount: unknown }) => ({ ...r, amount: Number(r.amount) }))
      const monthly = rows.reduce((sum: number, r: { amount: number }) => sum + r.amount, 0)
      return JSON.stringify({ subscriptions: rows, monthly_total_nzd: Math.round(monthly * 100) / 100 })
    }

    case 'add_subscription': {
      const name = String(input.name ?? '').trim()
      const amount = Number(input.amount)
      const day = Math.round(Number(input.day))
      if (!name) return JSON.stringify({ error: 'A subscription needs a name.' })
      if (!Number.isFinite(amount) || amount < 0) return JSON.stringify({ error: 'Amount must be a positive NZD figure.' })
      if (!(day >= 1 && day <= 31)) return JSON.stringify({ error: 'Day must be the day of the month it renews, 1 to 31.' })

      // Same name already on the list: that is an update, not a second row.
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id, name, amount, day')
        .eq('active', true)
        .ilike('name', name.replace(/[\\%_]/g, (c) => '\\' + c))
        .limit(1)
      if (existing?.[0]) {
        return JSON.stringify({ error: `${existing[0].name} is already on the list ($${Number(existing[0].amount).toFixed(2)} on the ${existing[0].day}). Use update_subscription with id ${existing[0].id} if it changed.` })
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .insert({ name, amount, day, note: (input.note as string)?.trim() || null })
        .select('id, name, amount, day')
        .single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, subscription: { ...data, amount: Number(data.amount) } })
    }

    case 'update_subscription': {
      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates.name = String(input.name).trim()
      if (input.amount !== undefined) updates.amount = Number(input.amount)
      if (input.day !== undefined) updates.day = Math.round(Number(input.day))
      if (input.note !== undefined) updates.note = (input.note as string)?.trim() || null
      if (Object.keys(updates).length === 0) return JSON.stringify({ error: 'Nothing to change.' })
      const { data, error } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('id', input.subscription_id as string)
        .select('id, name, amount, day')
        .single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true, subscription: { ...data, amount: Number(data.amount) } })
    }

    case 'cancel_subscription': {
      const { data, error } = await supabase
        .from('subscriptions')
        .update({ active: false })
        .eq('id', input.subscription_id as string)
        .select('id, name')
        .single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true, cancelled: data.name })
    }

    case 'get_dashboard_stats': {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [
        { count: activeJobs },
        { count: reviewJobs },
        { count: leads },
        { data: allJobs },
        { data: upcomingEvents },
        { count: totalClients },
      ] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","archived")'),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
        supabase.from('clients').select('*', { count: 'exact', head: true }).in('pipeline_stage', ['enquiry', 'discovery']),
        supabase.from('jobs').select('status, quote_value, created_at'),
        supabase.from('events').select('title, event_type, date, start_time').gte('date', now.toISOString().split('T')[0]).order('date').limit(5),
        supabase.from('clients').select('*', { count: 'exact', head: true }),
      ])

      const revenueThisMonth = (allJobs ?? [])
        .filter((j: { status: string; created_at: string }) => j.status === 'delivered' && j.created_at >= startOfMonth)
        .reduce((sum: number, j: { quote_value: number | null }) => sum + (j.quote_value || 0), 0)

      return JSON.stringify({
        active_jobs: activeJobs ?? 0,
        awaiting_review: reviewJobs ?? 0,
        leads_in_pipeline: leads ?? 0,
        total_clients: totalClients ?? 0,
        revenue_this_month: revenueThisMonth,
        upcoming_events: upcomingEvents ?? [],
      })
    }

    // ── Xero ────────────────────────────────
    case 'list_xero_contacts': {
      const contacts = await fetchXeroContacts((input.search as string) || undefined)
      if (contacts === null) return JSON.stringify({ error: 'Xero is not connected. Ask the user to connect it from the Finance page.' })
      return JSON.stringify({ contacts: contacts.slice(0, 20).map((c) => ({ id: c.ContactID, name: c.Name, email: c.EmailAddress })) })
    }

    case 'create_xero_invoice': {
      const now = new Date()
      const defaultDue = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10)
      const res = await createXeroInvoice({
        contactId: input.contact_id as string,
        contactName: input.contact_name as string,
        date: now.toISOString().slice(0, 10),
        dueDate: (input.due_date as string) || defaultDue,
        lineItems: [{ Description: (input.description as string) || 'Services', UnitAmount: input.amount as number, Quantity: 1 }],
        reference: (input.reference as string) || undefined,
        status: input.approve ? 'AUTHORISED' : 'DRAFT',
      })
      if (!res.ok) return JSON.stringify({ error: res.error })
      const invoice = res.data
      return JSON.stringify({ success: true, invoice: { id: invoice.InvoiceID, number: invoice.InvoiceNumber, status: invoice.Status, total: invoice.Total } })
    }

    case 'list_xero_invoices': {
      const invoices = await fetchOutstandingInvoices()
      return JSON.stringify({ invoices: invoices.map((inv) => ({ id: inv.InvoiceID, number: inv.InvoiceNumber, status: inv.Status, total: inv.Total, amountDue: inv.AmountDue })) })
    }

    case 'approve_xero_invoice': {
      const res = await approveXeroInvoice(input.invoice_id as string)
      if (!res.ok) return JSON.stringify({ error: res.error })
      return JSON.stringify({ success: true, invoice: { id: res.data.InvoiceID, number: res.data.InvoiceNumber, status: res.data.Status, total: res.data.Total } })
    }

    case 'send_xero_invoice': {
      // Approve first when it is still a draft: Xero refuses to email anything
      // that is not AUTHORISED, and "approve then send" is one action as far
      // as Arlo is concerned.
      const invoiceId = input.invoice_id as string
      const existing = await getXeroInvoice(invoiceId)
      if (!existing) return JSON.stringify({ error: 'That invoice is not in Xero.' })
      if (existing.Status === 'DRAFT' || existing.Status === 'SUBMITTED') {
        const approved = await approveXeroInvoice(invoiceId)
        if (!approved.ok) return JSON.stringify({ error: `Could not approve it before sending: ${approved.error}` })
      }
      const sent = await emailXeroInvoice(invoiceId)
      if (!sent.ok) return JSON.stringify({ error: sent.error })
      return JSON.stringify({ success: true, sent_to: sent.data.sentTo, invoice_number: sent.data.number })
    }

    case 'void_xero_invoice': {
      const res = await voidXeroInvoice(input.invoice_id as string)
      if (!res.ok) return JSON.stringify({ error: `${res.error} (An invoice with payments allocated has to have those removed first, and only an AUTHORISED invoice can be voided.)` })
      return JSON.stringify({ success: true })
    }

    case 'delete_xero_invoice': {
      const res = await deleteXeroInvoice(input.invoice_id as string)
      if (!res.ok) return JSON.stringify({ error: `${res.error} (An AUTHORISED invoice cannot be deleted — void it instead.)` })
      return JSON.stringify({ success: true })
    }

    case 'get_xero_invoice_detail': {
      const invoice = await getXeroInvoice(input.invoice_id as string)
      if (!invoice) return JSON.stringify({ error: 'Invoice not found.' })
      return JSON.stringify({
        invoice: {
          id: invoice.InvoiceID,
          number: invoice.InvoiceNumber,
          status: invoice.Status,
          total: invoice.Total,
          amount_due: invoice.AmountDue,
          payments: (invoice.Payments ?? []).map((p) => ({ payment_id: p.PaymentID, date: p.Date, amount: p.Amount, reference: p.Reference })),
        },
      })
    }

    case 'remove_xero_payment': {
      const res = await deleteXeroPayment(input.payment_id as string)
      if (!res.ok) return JSON.stringify({ error: res.error })
      return JSON.stringify({ success: true })
    }

    case 'update_xero_invoice': {
      const invoice = await updateXeroInvoice(input.invoice_id as string, {
        description: input.description as string | undefined,
        amount: input.amount != null ? Number(input.amount) : undefined,
        dueDate: input.due_date as string | undefined,
        reference: input.reference as string | undefined,
      })
      if (!invoice.ok) return JSON.stringify({ error: `${invoice.error} (Only a DRAFT invoice can be edited.)` })
      return JSON.stringify({ success: true, invoice: { id: invoice.data.InvoiceID, number: invoice.data.InvoiceNumber, status: invoice.data.Status, total: invoice.data.Total } })
    }

    // ── Email ───────────────────────────────
    case 'list_recent_emails': {
      const limit = input.limit != null ? Number(input.limit) : 15
      const emails = input.unread_only ? await fetchUnreadEmails(limit) : await fetchRecentEmails(limit)
      return JSON.stringify({ emails })
    }

    // ── Retainer content backlog ────────────
    case 'get_content_backlog': {
      const backlog = await getContentBacklog(supabase)
      const filter = (input.client_name as string | undefined)?.toLowerCase().trim()
      if (filter) {
        const matches = backlog.clients.filter((c) => c.clientName.toLowerCase().includes(filter))
        if (matches.length === 0) return JSON.stringify({ error: `No retainer client matching "${input.client_name}". Retainer clients: ${backlog.clients.map((c) => c.clientName).join(', ') || 'none'}.` })
        return JSON.stringify({ ...backlog, clients: matches })
      }
      return JSON.stringify(backlog)
    }

    // ── Proposals ───────────────────────────
    case 'prepare_proposal': {
      const clientId = input.client_id as string
      const jobId = (input.job_id as string) || null
      const [client, jobs, emails, job, existing] = await Promise.all([
        supabase.from('clients').select('name, contact_person, email, location, status, client_category, monthly_retainer, shoots_per_month, videos_per_month, notes').eq('id', clientId).single(),
        supabase.from('jobs').select('id, name, status, job_type, shoot_date, quote_value').eq('client_id', clientId).not('status', 'in', '("delivered","archived","handed_over")').order('created_at', { ascending: false }).limit(6),
        supabase.from('client_emails').select('subject, heading, summary, received_at').eq('client_id', clientId).order('received_at', { ascending: false }).limit(5),
        jobId ? supabase.from('jobs').select('id, name, job_type, status, shoot_date, shoot_location, quote_value, notes, deliverables(title)').eq('id', jobId).maybeSingle() : Promise.resolve({ data: null }),
        jobId ? supabase.from('proposals').select('id, status, total_value, created_at').eq('job_id', jobId).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (client.error || !client.data) return JSON.stringify({ error: client.error ? dbErrorMessage(client.error) : 'No such client.' })
      const prop = existing.data as { id: string; status: string; total_value: number } | null
      if (prop && prop.status !== 'draft') {
        return JSON.stringify({ error: `This job already has a proposal that was ${prop.status}. Tell Arlo; a sent proposal cannot be redrafted. Changes go through update_proposal only while it is a draft.`, proposal_id: prop.id })
      }
      const questions = buildProposalIntake(client.data, job.data, jobs.data ?? [])
      if (prop) {
        questions.unshift({ key: 'existing', question: `There's already a draft proposal on this job ($${prop.total_value}). Redraft it from scratch, or just edit it?`, options: [{ label: 'Redraft from scratch' }, { label: 'Just edit the existing one', detail: 'Free, no redraft' }] })
      }
      return JSON.stringify({
        client: client.data,
        job: job.data,
        open_jobs: jobs.data ?? [],
        existing_proposal: prop,
        recent_client_emails: emails.data ?? [],
        ask_arlo_questions: questions,
        guidance: 'Call ask_arlo ONCE with ask_arlo_questions as they are (sharpen wording with names from the record or a pasted thread; drop a question only if Arlo already answered it in this conversation). Do not add small questions of your own and do not split it into several popups. When answers come back: if the job is new, create it with create_job first; if he chose "Just edit the existing one", use update_proposal instead. Otherwise call create_proposal once with brief keyed by each question key (his answers word for word) and price_lines that add up to the agreed price, laid out the way he chose. If an answer is unclear or says to type something but is blank, ask one short follow-up popup about only that, then draft.',
      })
    }

    case 'create_proposal': {
      const jobId = input.job_id as string
      const brief = (input.brief ?? {}) as Record<string, unknown>
      const gaps = missingBriefKeys(brief, PROPOSAL_REQUIRED_KEYS)
      if (gaps.length) {
        return JSON.stringify({ error: `NOT drafted. The brief is missing: ${gaps.join(', ')}. Call prepare_proposal, ask Arlo in one ask_arlo popup, then call create_proposal again with every answer in brief.` })
      }
      const pricingMode: 'total' | 'options' = input.pricing_mode === 'options' ? 'options' : 'total'
      const priceSuffix = String(input.price_suffix ?? '').trim()
      const priceLines = (Array.isArray(input.price_lines) ? input.price_lines : [])
        .map((l: { description?: unknown; amount?: unknown }) => ({ description: String(l?.description ?? '').trim(), amount: Number(l?.amount) }))
        .filter((l: PriceLine) => l.description && Number.isFinite(l.amount) && l.amount >= 0)
      if (priceLines.length === 0) return JSON.stringify({ error: 'Pass price_lines with the agreed amounts. Never invent a price: ask Arlo if you do not have one.' })

      const [{ data: job, error: jobError }, { data: existing }] = await Promise.all([
        supabase.from('jobs').select('id, name, client_id, clients(name, contact_person)').eq('id', jobId).single(),
        supabase.from('proposals').select('id, status').eq('job_id', jobId).maybeSingle(),
      ])
      if (jobError || !job) return JSON.stringify({ error: jobError ? dbErrorMessage(jobError) : 'No such job.' })
      if (existing && existing.status !== 'draft') return JSON.stringify({ error: `This job's proposal was already ${existing.status}, so it cannot be redrafted.` })
      if (existing && input.replace_existing !== true) {
        return JSON.stringify({ error: 'This job already has a draft proposal. Ask Arlo whether to redraft it (call again with replace_existing true) or edit it with update_proposal.', proposal_id: existing.id })
      }

      const client = job.clients as unknown as { name: string; contact_person: string | null }
      const today = new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })
      const drafted = await draftProposal({
        pricingMode,
        priceSuffix,
        clientName: client.name,
        contactPerson: client.contact_person,
        jobName: job.name,
        priceLines,
        brief: briefLines(brief),
        today,
      })
      if ('error' in drafted) return JSON.stringify({ error: drafted.error })

      const row = {
        cover_note: drafted.coverNote,
        services: JSON.stringify(drafted.services),
        inclusions: drafted.inclusions.join('\n'),
        payment_terms: drafted.paymentTerms,
        total_value: drafted.total,
        pricing_mode: pricingMode,
        price_suffix: pricingMode === 'options' ? priceSuffix || null : null,
        updated_at: new Date().toISOString(),
      }
      const saved = existing
        ? await supabase.from('proposals').update(row).eq('id', existing.id).select('id').single()
        : await supabase.from('proposals').insert({ job_id: jobId, ...row }).select('id').single()
      if (saved.error || !saved.data) return JSON.stringify({ error: saved.error?.message || 'Could not save the proposal.' })
      await supabase.from('activities').insert({ action: 'proposal_created', details: `Proposal drafted for "${job.name}"`, job_id: jobId, client_id: job.client_id })
      return JSON.stringify({
        success: true,
        proposal: { id: saved.data.id, job_id: jobId, name: job.name, total: drafted.total },
        drafter_notes: drafted.notes,
        next: 'Saved as a draft, not sent. Tell Arlo in one or two lines it is drafted with the total, mention drafter_notes if they say anything, and offer to send it. Any edit he asks for is update_proposal, never another create_proposal.',
      })
    }

    case 'update_proposal': {
      const { data: prop, error: propError } = await supabase.from('proposals').select('id, status, job_id').eq('id', input.proposal_id as string).single()
      if (propError || !prop) return JSON.stringify({ error: propError ? dbErrorMessage(propError) : 'No such proposal.' })
      if (prop.status !== 'draft') return JSON.stringify({ error: `That proposal was already ${prop.status}, so it cannot be changed.` })
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof input.cover_note === 'string') updates.cover_note = input.cover_note
      if (typeof input.payment_terms === 'string') updates.payment_terms = input.payment_terms
      if (Array.isArray(input.inclusions)) updates.inclusions = (input.inclusions as string[]).join('\n')
      if (Array.isArray(input.services)) {
        const lines = (input.services as PriceLine[]).map((l) => ({ description: String(l.description), amount: Number(l.amount) || 0 }))
        updates.services = JSON.stringify(lines)
        updates.total_value = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100
      }
      if (input.pricing_mode === 'total' || input.pricing_mode === 'options') updates.pricing_mode = input.pricing_mode
      if (typeof input.price_suffix === 'string') updates.price_suffix = input.price_suffix.trim() || null
      // The stored figure follows the mode: the sum, or the cheapest package.
      if (updates.pricing_mode || Array.isArray(input.services)) {
        const { data: cur } = await supabase.from('proposals').select('services, pricing_mode').eq('id', prop.id).single()
        const mode = (updates.pricing_mode as string) ?? cur?.pricing_mode
        let lines: PriceLine[] = []
        try { lines = Array.isArray(input.services) ? (input.services as PriceLine[]) : JSON.parse(cur?.services || '[]') } catch { /* keep empty */ }
        const amounts = lines.map((l) => Number(l.amount) || 0)
        if (amounts.length) updates.total_value = mode === 'options' ? Math.min(...amounts) : Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100
      }
      const { error } = await supabase.from('proposals').update(updates).eq('id', prop.id)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, proposal: { id: prop.id, job_id: prop.job_id, name: 'Proposal' }, total: updates.total_value })
    }

    // ── Memory ──────────────────────────────
    case 'remember': {
      const content = String(input.content ?? '').trim()
      if (!content) return JSON.stringify({ error: 'Nothing to remember.' })
      if (content.length > 500) return JSON.stringify({ error: 'Keep a memory to one short fact (under 500 characters).' })
      const category = isMemoryCategory(input.category) ? input.category : 'preference'
      const { data, error } = await supabase
        .from('ai_memories')
        .insert({ content, category, client_id: (input.client_id as string) || null, source: 'tui' })
        .select('id, category, content')
        .single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true, memory: data })
    }

    case 'update_memory': {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.content !== undefined) {
        const content = String(input.content).trim()
        if (!content || content.length > 500) return JSON.stringify({ error: 'A memory is one short fact, 1 to 500 characters.' })
        updates.content = content
      }
      if (isMemoryCategory(input.category)) updates.category = input.category
      const { data, error } = await supabase
        .from('ai_memories')
        .update(updates)
        .eq('id', input.memory_id as string)
        .select('id, category, content')
        .single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true, memory: data })
    }

    case 'forget': {
      const { data, error } = await supabase
        .from('ai_memories')
        .delete()
        .eq('id', input.memory_id as string)
        .select('content')
        .single()
      if (error) return JSON.stringify({ error: dbErrorMessage(error) })
      return JSON.stringify({ success: true, forgot: data.content })
    }

    // ── Assistant flags ─────────────────────
    case 'snooze_flag': {
      const days = input.days != null ? Number(input.days) : 7
      const until = new Date(Date.now() + days * 86400000).toISOString()
      const { error } = await supabase
        .from('assistant_flags')
        .update({ snooze_until: until })
        .eq('key', input.key as string)
      if (error) return JSON.stringify({ error: `Could not snooze that flag: ${error.message}` })
      return JSON.stringify({ success: true, key: input.key, snoozed_until: until })
    }

    case 'resolve_flag': {
      const { error } = await supabase
        .from('assistant_flags')
        .update({ resolved_at: new Date().toISOString() })
        .eq('key', input.key as string)
      if (error) return JSON.stringify({ error: `Could not resolve that flag: ${error.message}` })
      return JSON.stringify({ success: true, key: input.key })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
