import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import ClientRecord from './ClientRecord'

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const { tab } = await searchParams

  const supabase = await createServerSupabaseClient()

  type ClientRow = { id: string; name: string; email: string | null; phone: string | null; location: string | null; lead_source: string | null; first_contact: string | null; pipeline_stage: string; status: string; lifetime_value: number; notes: string | null; tags: string | null; portal_token?: string | null }

  // Fetch all data in parallel for speed
  const [clientResult, { data: jobs }, { data: activities }, { data: documents }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, email, phone, location, lead_source, first_contact, pipeline_stage, status, lifetime_value, notes, tags, portal_token')
      .eq('id', id)
      .single(),
    supabase
      .from('jobs')
      .select('id, name, job_type, status, quote_value, shoot_date')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('activities')
      .select('id, action, details, created_at, job_id, jobs(name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('documents')
      .select('id, name, doc_type, updated_at')
      .eq('client_id', id)
      .order('updated_at', { ascending: false }),
  ])

  const client = clientResult.data as ClientRow | null
  if (!client) notFound()

  const completedJobs = (jobs ?? []).filter((j) => j.status === 'delivered' || j.status === 'archived').length

  // Normalise keys to camelCase for the client component
  const clientData = {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    location: client.location,
    leadSource: client.lead_source,
    firstContact: client.first_contact,
    pipelineStage: client.pipeline_stage,
    status: client.status,
    lifetimeValue: client.lifetime_value,
    notes: client.notes,
    tags: client.tags,
    portalToken: client.portal_token ?? null,
    documents: (documents ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      docType: d.doc_type,
      updatedAt: d.updated_at,
    })),
    jobs: (jobs ?? []).map((j) => ({
      id: j.id,
      name: j.name,
      jobType: j.job_type,
      status: j.status,
      quoteValue: j.quote_value,
      shootDate: j.shoot_date,
    })),
    activities: (activities ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      details: a.details,
      createdAt: a.created_at,
      job: a.jobs as unknown as { name: string } | null,
    })),
  }

  return (
    <ClientRecord
      client={clientData}
      completedJobs={completedJobs}
      activeTab={tab || 'details'}
    />
  )
}
