import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

async function getSystemPrompt(supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never) {
  const now = new Date()
  const today = now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const todayISO = now.toISOString().split('T')[0]
  const weekFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  // Fetch live context in parallel — keep lightweight for fast first-token
  const [
    { data: todayEvents },
    { data: activeJobs },
    { count: totalClients },
  ] = await Promise.all([
    supabase.from('events').select('title, event_type, date, start_time').gte('date', todayISO).lte('date', weekFromNow).order('date').order('start_time').limit(7),
    supabase.from('jobs').select('name, status, clients(name)').not('status', 'in', '("delivered","archived")').order('created_at', { ascending: false }).limit(8),
    supabase.from('clients').select('*', { count: 'exact', head: true }),
  ])

  const eventsBlock = (todayEvents ?? []).length > 0
    ? `\nSchedule (7d): ${(todayEvents ?? []).map(e => `${e.date?.split('T')[0]} ${e.start_time || ''} ${e.title} (${e.event_type})`).join(' | ')}`
    : ''

  const activeBlock = (activeJobs ?? []).length > 0
    ? `\nActive jobs: ${(activeJobs ?? []).map(j => `"${j.name}" [${j.status}]${(j.clients as unknown as { name: string })?.name ? ` — ${(j.clients as unknown as { name: string }).name}` : ''}`).join(' | ')}`
    : ''

  return `You are the AI assistant for Tui Media CRM (Arlo Radford, videography/photography, Nelson NZ).

You can search, create, and update clients, jobs, events, documents, and gear. You can view stats and manage tasks.
IMPORTANT: You CANNOT delete clients. Client deletion is not permitted via AI — tell the user to do it from the client profile page.

Rules: Be short (1-2 sentences). Act immediately with tools. Use sensible defaults (status "lead", pipeline "enquiry"). Confirm actions in one sentence.
Today: ${today}. Clients: ${totalClients ?? 0}.

Enums — Pipeline: enquiry,discovery,proposal,negotiation,won,lost | Client status: lead,active,inactive | Job status: enquiry,booked,preproduction,shootday,editing,review,approved,delivered,archived | Events: shoot,meeting,deadline,personal | Gear: available,in-use,maintenance,retired | Docs: contract,invoice,brief,other
${eventsBlock}${activeBlock}`
}

const TOOLS: Anthropic.Tool[] = [
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
        status: { type: 'string', enum: ['lead', 'active', 'inactive'] },
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
        status: { type: 'string', enum: ['lead', 'active', 'inactive'] },
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
    description: 'Create a new job. Requires a name and client_id. Optionally specify job_type to auto-populate tasks from templates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        client_id: { type: 'string', description: 'Client UUID. Search for the client first if you need to find their ID.' },
        job_type: { type: 'string', description: 'e.g. wedding, commercial, event, music_video' },
        shoot_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        shoot_location: { type: 'string' },
        quote_value: { type: 'number' },
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

  // ── Gear ──────────────────────────────────────
  {
    name: 'list_gear',
    description: 'List all gear/equipment items.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_gear',
    description: 'Add a new piece of gear/equipment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        category: { type: 'string', description: 'e.g. Camera, Lens, Audio, Lighting, Stabiliser, Drone, Accessory' },
        purchase_value: { type: 'number' },
        insurance_value: { type: 'number' },
        serial_number: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_gear',
    description: 'Update gear details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        gear_id: { type: 'string' },
        name: { type: 'string' },
        category: { type: 'string' },
        status: { type: 'string', enum: ['available', 'in-use', 'maintenance', 'retired'] },
        purchase_value: { type: 'number' },
        insurance_value: { type: 'number' },
        serial_number: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['gear_id'],
    },
  },
  {
    name: 'delete_gear',
    description: 'Delete a gear item by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        gear_id: { type: 'string' },
      },
      required: ['gear_id'],
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
]

// ── Tool Executor ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, input: Record<string, unknown>, supabase: any): Promise<string> {
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
      const { data: job } = await supabase.from('jobs').select('client_id, name').eq('id', input.job_id as string).single()
      if (!job) return JSON.stringify({ error: 'Job not found' })

      await supabase.from('jobs').update({ status: input.status as string }).eq('id', input.job_id as string)
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

    // ── Gear ────────────────────────────────
    case 'list_gear': {
      const { data, error } = await supabase.from('gear').select('*').order('name')
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ gear: data })
    }

    case 'create_gear': {
      const { data, error } = await supabase.from('gear').insert({
        name: input.name as string,
        category: (input.category as string) || null,
        purchase_value: input.purchase_value != null ? Number(input.purchase_value) : null,
        insurance_value: input.insurance_value != null ? Number(input.insurance_value) : null,
        serial_number: (input.serial_number as string) || null,
        notes: (input.notes as string) || null,
      }).select('id, name').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, gear: data })
    }

    case 'update_gear': {
      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates.name = input.name
      if (input.category !== undefined) updates.category = input.category || null
      if (input.status !== undefined) updates.status = input.status
      if (input.purchase_value !== undefined) updates.purchase_value = input.purchase_value != null ? Number(input.purchase_value) : null
      if (input.insurance_value !== undefined) updates.insurance_value = input.insurance_value != null ? Number(input.insurance_value) : null
      if (input.serial_number !== undefined) updates.serial_number = input.serial_number || null
      if (input.notes !== undefined) updates.notes = input.notes || null

      const { data, error } = await supabase.from('gear').update(updates).eq('id', input.gear_id as string).select('id, name').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, gear: data })
    }

    case 'delete_gear': {
      const { error } = await supabase.from('gear').delete().eq('id', input.gear_id as string)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true })
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

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const { messages } = await request.json()
  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: 'Messages array is required.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey })
  const supabase = await createServerSupabaseClient()

  const apiMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Pre-fetch system prompt with live context before starting the stream
  const systemPrompt = await getSystemPrompt(supabase)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const currentMessages: Anthropic.MessageParam[] = [...apiMessages]
        const createdLinks: { path: string; label: string }[] = []
        const maxRounds = 10

        for (let round = 0; round < maxRounds; round++) {
          const anthropicStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            system: systemPrompt,
            messages: currentMessages,
            tools: TOOLS,
          })

          anthropicStream.on('text', (text) => {
            controller.enqueue(encoder.encode(text))
          })

          const finalMessage = await anthropicStream.finalMessage()

          const toolUseBlocks = finalMessage.content.filter(
            (block) => block.type === 'tool_use'
          )

          if (toolUseBlocks.length === 0) {
            // Append any collected links before closing
            if (createdLinks.length > 0) {
              for (const link of createdLinks) {
                controller.enqueue(encoder.encode(`\n[[LINK:${link.path}|${link.label}]]`))
              }
            }
            controller.close()
            return
          }

          // Signal to the UI that we're executing tools
          controller.enqueue(encoder.encode('[[WORKING]]'))

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentMessages.push({ role: 'assistant', content: finalMessage.content as any })

          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const block of toolUseBlocks) {
            if (block.type === 'tool_use') {
              const result = await executeTool(block.name, block.input as Record<string, unknown>, supabase)
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })

              // Track created entities for link buttons
              try {
                const parsed = JSON.parse(result)
                if (parsed.success) {
                  if (parsed.client?.id) createdLinks.push({ path: `/dashboard/clients/${parsed.client.id}`, label: `View ${parsed.client.name || 'Client'}` })
                  if (parsed.job?.id) createdLinks.push({ path: `/dashboard/jobs/${parsed.job.id}`, label: `View ${parsed.job.name || 'Job'}` })
                  if (parsed.document?.id) createdLinks.push({ path: `/dashboard/documents/${parsed.document.id}`, label: `View ${parsed.document.name || 'Document'}` })
                  if (parsed.event?.id) createdLinks.push({ path: `/dashboard/calendar`, label: 'View Calendar' })
                  if (parsed.gear?.id) createdLinks.push({ path: `/dashboard/gear`, label: `View ${parsed.gear.name || 'Gear'}` })
                }
              } catch { /* not JSON or no link needed */ }
            }
          }

          // Clear the working indicator
          controller.enqueue(encoder.encode('[[/WORKING]]'))

          currentMessages.push({ role: 'user', content: toolResults })
        }

        controller.enqueue(encoder.encode('\n\n(Reached maximum tool rounds.)'))
        controller.close()
      } catch (err) {
        console.error('AI chat error:', err)
        controller.enqueue(encoder.encode('Sorry, something went wrong. Please try again.'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
