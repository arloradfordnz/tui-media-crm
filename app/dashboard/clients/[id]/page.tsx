import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import ClientRecord from './ClientRecord'

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const { tab } = await searchParams

  const supabase = await createServerSupabaseClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email, phone, location, lead_source, first_contact, pipeline_stage, status, lifetime_value, notes, tags')
    .eq('id', id)
    .single()

  if (!client) notFound()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, name, job_type, status, quote_value, shoot_date')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const { data: activities } = await supabase
    .from('activities')
    .select('id, action, details, created_at, job_id, jobs(name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

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
