import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { fetchXeroContacts, createXeroInvoice, fetchOutstandingInvoices, approveXeroInvoice, voidXeroInvoice, deleteXeroInvoice, updateXeroInvoice, getXeroInvoice, deleteXeroPayment } from '@/lib/xero'
import { fetchRecentEmails, fetchUnreadEmails } from '@/lib/mail'
import { getContentBacklog } from '@/lib/content-backlog'
import { findDuplicateJobName } from '@/lib/job-naming'

// Shared tool definitions + executor for every AI surface (dashboard chat,
// SMS assistant). One tool set, one set of side effects — a job marked
// "delivered" from a text message must behave identically to marking it
// delivered from the dashboard.

// Tool names that mutate state — used by callers to decide whether to
// invalidate a cached view (dashboard router.refresh()) after the turn.
export const MUTATING_TOOLS = new Set([
  'create_client', 'update_client',
  'create_job', 'update_job', 'update_job_status', 'delete_job', 'toggle_task',
  'create_event', 'delete_event',
  'create_document', 'delete_document',
  'create_deliverable',
  'create_todo', 'complete_todo',
  'create_xero_invoice', 'approve_xero_invoice', 'void_xero_invoice', 'delete_xero_invoice', 'update_xero_invoice', 'remove_xero_payment',
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

// Plain-English description of what is about to happen, so the confirmation
// the user sees is about the act, not about a tool name.
function describeAction(name: string, input: Record<string, unknown>): string {
  const id = (k: string) => String(input[k] ?? '')
  switch (name) {
    case 'delete_job': return `Permanently delete job ${id('job_id')}, including its tasks and deliverables.`
    case 'delete_event': return `Permanently delete calendar event ${id('event_id')}.`
    case 'delete_document': return `Permanently delete document ${id('document_id')}.`
    case 'void_xero_invoice': return `Void Xero invoice ${id('invoice_id')}. Xero has no un-void.`
    case 'delete_xero_invoice': return `Permanently delete Xero invoice ${id('invoice_id')}.`
    case 'remove_xero_payment': return `Remove Xero payment ${id('payment_id')}. This also un-reconciles the bank transaction it was matched to.`
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
    description: 'Create a new client. Only name is required.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        location: { type: 'string' },
        lead_source: { type: 'string' },
        pipeline_stage: { type: 'string', enum: ['enquiry', 'discovery', 'proposal', 'negotiation', 'won', 'lost'] },
        status: { type: 'string', enum: ['lead', 'active', 'past', 'archived'] },
        client_category: { type: 'string', enum: ['retainer', 'marketing', 'one_off'], description: 'Client type/category' },
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
        email: { type: 'string' },
        phone: { type: 'string' },
        location: { type: 'string' },
        lead_source: { type: 'string' },
        pipeline_stage: { type: 'string', enum: ['enquiry', 'discovery', 'proposal', 'negotiation', 'won', 'lost'] },
        status: { type: 'string', enum: ['lead', 'active', 'past', 'archived'] },
        client_category: { type: 'string', enum: ['retainer', 'marketing', 'one_off'] },
        notes: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['client_id'],
    },
  },
  // ── Jobs ──────────────────────────────────────
  {
    name: 'search_jobs',
    description: 'Search for jobs by name, or filter by status/client. Returns id, name, status, job_type, shoot_date, quote_value, and client name.',
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
        job_id: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'create_job',
    description: 'Create a new job. Requires a name and client_id. Optionally specify job_type to auto-populate tasks from templates. If a job with essentially the same name already exists for this client (e.g. "July Content" when "Team Bainbridge — July Content" already exists), this returns a duplicate warning instead of creating it — check with Arlo whether he meant that existing job, then call again with confirm:true only if he really wants a second one.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        client_id: { type: 'string', description: 'Client UUID. Search for the client first if you need to find their ID.' },
        job_type: { type: 'string', description: 'e.g. wedding, commercial, event, music_video' },
        shoot_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        shoot_location: { type: 'string' },
        quote_value: { type: 'number' },
        confirm: { type: 'boolean', description: 'Set true to create anyway after a duplicate warning and Arlo confirming he wants a second job with that name. Omit on the first attempt.' },
      },
      required: ['name', 'client_id'],
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
        status: { type: 'string', enum: ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'delivered', 'archived'] },
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
        status: { type: 'string', enum: ['enquiry', 'booked', 'preproduction', 'shootday', 'editing', 'review', 'approved', 'delivered', 'archived'] },
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
        job_id: { type: 'string', description: 'Optional job ID to link this event to' },
      },
      required: ['title', 'date'],
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
    description: 'Create a new document template.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        doc_type: { type: 'string', enum: ['contract', 'invoice', 'brief', 'other'] },
        content: { type: 'string', description: 'Document body text' },
      },
      required: ['name'],
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
    description: 'Create a sales invoice in Xero for a contact. Use list_xero_contacts first to get the ContactID. Creates as DRAFT unless send_now is true.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'string', description: 'Xero ContactID (from list_xero_contacts)' },
        contact_name: { type: 'string', description: 'Contact display name (for confirmation)' },
        description: { type: 'string', description: 'Invoice line item description' },
        amount: { type: 'number', description: 'Amount excluding GST' },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD. Defaults to 14 days from today.' },
        reference: { type: 'string', description: 'Optional invoice reference/PO number' },
        send_now: { type: 'boolean', description: 'If true, approves the invoice immediately (status AUTHORISED). Default false (DRAFT).' },
      },
      required: ['contact_id', 'contact_name', 'amount'],
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
        description: { type: 'string', description: 'New line item description' },
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
]

// ── Tool Executor ──────────────────────────────────────────────────────────────

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
        action: describeAction(name, input),
        instruction:
          'NOT executed. Tell Arlo exactly what you are about to do and ask him to confirm. Do not retry this tool until he has.',
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
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ client: data })
    }

    case 'create_client': {
      const { data, error } = await supabase.from('clients').insert({
        name: input.name as string,
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
      if (error) return JSON.stringify({ error: error.message })
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
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ job: data })
    }

    case 'create_job': {
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
      }).select('id, name').single()

      if (error) return JSON.stringify({ error: error.message })

      if (input.job_type && job) {
        const { data: template } = await supabase
          .from('job_templates')
          .select('id, template_tasks(phase, title, sort_order), template_deliverables(title, description)')
          .eq('job_type', input.job_type as string)
          .single()

        if (template) {
          for (const t of (template.template_tasks as { phase: string; title: string; sort_order: number }[])) {
            await supabase.from('job_tasks').insert({ job_id: job.id, phase: t.phase, title: t.title, sort_order: t.sort_order })
          }
          for (const d of (template.template_deliverables as { title: string; description: string | null }[])) {
            await supabase.from('deliverables').insert({ job_id: job.id, title: d.title, description: d.description })
          }
        }
      }

      if (job) {
        await supabase.from('activities').insert({
          action: 'job_created',
          details: `Job "${input.name}" created`,
          job_id: job.id,
          client_id: input.client_id as string,
        })
      }

      return JSON.stringify({ success: true, job })
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
      if (error) return JSON.stringify({ error: error.message })

      if (input.status) {
        await supabase.from('activities').insert({
          action: 'status_changed',
          details: `Status changed to ${input.status}`,
          job_id: input.job_id as string,
        })
      }

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
      const { error } = await supabase.from('jobs').delete().eq('id', input.job_id as string)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true })
    }

    case 'toggle_task': {
      const { error } = await supabase.from('job_tasks').update({ completed: input.completed as boolean }).eq('id', input.task_id as string)
      if (error) return JSON.stringify({ error: error.message })
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

      let query = supabase.from('events').select('id, title, event_type, date, start_time, end_time, notes, job_id, jobs(name)')
        .gte('date', fromDate)
        .lte('date', toDate)

      if (input.event_type) query = query.eq('event_type', input.event_type as string)

      const { data, error } = await query.order('date').order('start_time')
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ events: data })
    }

    case 'create_event': {
      const { data, error } = await supabase.from('events').insert({
        title: input.title as string,
        event_type: (input.event_type as string) || 'personal',
        date: new Date(input.date as string).toISOString(),
        start_time: (input.start_time as string) || null,
        end_time: (input.end_time as string) || null,
        notes: (input.notes as string) || null,
        job_id: (input.job_id as string) || null,
      }).select('id, title, date').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, event: data })
    }

    case 'delete_event': {
      const { error } = await supabase.from('events').delete().eq('id', input.event_id as string)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true })
    }

    // ── Documents ───────────────────────────
    case 'list_documents': {
      const { data, error } = await supabase.from('documents').select('id, name, doc_type, created_at, updated_at').order('updated_at', { ascending: false })
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ documents: data })
    }

    case 'create_document': {
      const { data, error } = await supabase.from('documents').insert({
        name: input.name as string,
        doc_type: (input.doc_type as string) || 'contract',
        content: (input.content as string) || '',
      }).select('id, name').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, document: data })
    }

    case 'delete_document': {
      const { error } = await supabase.from('documents').delete().eq('id', input.doc_id as string)
      if (error) return JSON.stringify({ error: error.message })
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
      const invoice = await createXeroInvoice({
        contactId: input.contact_id as string,
        contactName: input.contact_name as string,
        date: now.toISOString().slice(0, 10),
        dueDate: (input.due_date as string) || defaultDue,
        lineItems: [{ Description: (input.description as string) || 'Services', UnitAmount: input.amount as number, Quantity: 1 }],
        reference: (input.reference as string) || undefined,
        status: input.send_now ? 'AUTHORISED' : 'DRAFT',
      })
      if (!invoice) return JSON.stringify({ error: 'Failed to create invoice. Xero may not be connected or may require updated permissions.' })
      return JSON.stringify({ success: true, invoice: { id: invoice.InvoiceID, number: invoice.InvoiceNumber, status: invoice.Status, total: invoice.Total } })
    }

    case 'list_xero_invoices': {
      const invoices = await fetchOutstandingInvoices()
      return JSON.stringify({ invoices: invoices.map((inv) => ({ id: inv.InvoiceID, number: inv.InvoiceNumber, status: inv.Status, total: inv.Total, amountDue: inv.AmountDue })) })
    }

    case 'approve_xero_invoice': {
      const ok = await approveXeroInvoice(input.invoice_id as string)
      if (!ok) return JSON.stringify({ error: 'Failed to approve invoice.' })
      return JSON.stringify({ success: true })
    }

    case 'void_xero_invoice': {
      const ok = await voidXeroInvoice(input.invoice_id as string)
      if (!ok) return JSON.stringify({ error: 'Failed to void invoice — it may have payments allocated, or may not be in AUTHORISED status.' })
      return JSON.stringify({ success: true })
    }

    case 'delete_xero_invoice': {
      const ok = await deleteXeroInvoice(input.invoice_id as string)
      if (!ok) return JSON.stringify({ error: 'Failed to delete invoice — it may already be AUTHORISED (use void_xero_invoice instead) or not exist.' })
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
      const ok = await deleteXeroPayment(input.payment_id as string)
      if (!ok) return JSON.stringify({ error: 'Failed to remove payment — it may already be deleted, or reconciled in a way Xero won\'t allow removing via API.' })
      return JSON.stringify({ success: true })
    }

    case 'update_xero_invoice': {
      const invoice = await updateXeroInvoice(input.invoice_id as string, {
        description: input.description as string | undefined,
        amount: input.amount != null ? Number(input.amount) : undefined,
        dueDate: input.due_date as string | undefined,
        reference: input.reference as string | undefined,
      })
      if (!invoice) return JSON.stringify({ error: 'Failed to update invoice — it may no longer be in DRAFT status.' })
      return JSON.stringify({ success: true, invoice: { id: invoice.InvoiceID, number: invoice.InvoiceNumber, status: invoice.Status, total: invoice.Total } })
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

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
