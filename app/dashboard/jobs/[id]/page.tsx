import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import JobRecord from './JobRecord'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, name, job_type, status, shoot_date, shoot_location, quote_value, revision_limit, revisions_used, notes, portal_token, client_id, clients(id, name)')
    .eq('id', id)
    .single()

  if (!job) notFound()

  const [
    { data: tasks },
    { data: deliverables },
    { data: revisions },
    { data: proposals },
    { data: activities },
  ] = await Promise.all([
    supabase.from('job_tasks').select('id, phase, title, completed').eq('job_id', id).order('sort_order', { ascending: true }),
    supabase.from('deliverables').select('id, title, description, completed, delivery_files(id, original_name, version_label, delivery_status, created_at)').eq('job_id', id),
    supabase.from('revisions').select('id, round, request, status, created_at').eq('job_id', id).order('round', { ascending: true }),
    supabase.from('proposals').select('id, status, token, total_value, sent_at, responded_at, created_at').eq('job_id', id).order('created_at', { ascending: false }),
    supabase.from('activities').select('id, action, details, created_at').eq('job_id', id).order('created_at', { ascending: false }).limit(20),
  ])

  const client = job.clients as unknown as { id: string; name: string }

  const jobData = {
    id: job.id,
    name: job.name,
    jobType: job.job_type,
    status: job.status,
    shootDate: job.shoot_date,
    shootLocation: job.shoot_location,
    quoteValue: job.quote_value,
    revisionLimit: job.revision_limit,
    revisionsUsed: job.revisions_used,
    notes: job.notes,
    portalToken: job.portal_token,
    client,
    tasks: (tasks ?? []).map((t) => ({
      id: t.id,
      phase: t.phase,
      title: t.title,
      completed: t.completed,
    })),
    deliverables: (deliverables ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      completed: d.completed,
      deliveryFiles: ((d.delivery_files as unknown as { id: string; original_name: string; version_label: string; delivery_status: string; created_at: string }[]) ?? []).map((f) => ({
        id: f.id,
        originalName: f.original_name,
        versionLabel: f.version_label,
        deliveryStatus: f.delivery_status,
        createdAt: f.created_at,
      })),
    })),
    revisions: (revisions ?? []).map((r) => ({
      id: r.id,
      round: r.round,
      request: r.request,
      status: r.status,
      createdAt: r.created_at,
    })),
    proposals: (proposals ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      token: p.token,
      totalValue: p.total_value,
      sentAt: p.sent_at,
      respondedAt: p.responded_at,
      createdAt: p.created_at,
    })),
    activities: (activities ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      details: a.details,
      createdAt: a.created_at,
    })),
  }

  return <JobRecord job={jobData} />
}
