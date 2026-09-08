import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import JobRecord from './JobRecord'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  // Fetch the job row alongside all related collections; everything keys off the route param.
  const [
    jobRes,
    { data: tasks },
    { data: deliverables },
    { data: revisions },
    { data: proposals },
    { data: activities },
    timeEntriesRes,
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, name, job_type, status, shoot_date, shoot_location, quote_value, expected_amount, expected_payment_date, revision_limit, revisions_used, hourly_rate, estimated_hours, notes, ad_platform, ad_account_ref, ad_spend_budget, campaign_launched_at, campaign_ends_at, handover_at, client_id, clients(id, name)')
      .eq('id', id)
      .single(),
    supabase.from('job_tasks').select('id, phase, title, completed').eq('job_id', id).order('sort_order', { ascending: true }),
    supabase.from('deliverables').select('id, title, description, completed, delivery_files(id, original_name, version_label, delivery_status, created_at, file_url, personal_note)').eq('job_id', id),
    // '*' keeps this working whether or not migration_revision_responses.sql
    // (reply / responded_at columns) has been run yet.
    supabase.from('revisions').select('*').eq('job_id', id).order('round', { ascending: true }),
    supabase.from('proposals').select('id, status, token, total_value, sent_at, responded_at, created_at').eq('job_id', id).order('created_at', { ascending: false }),
    supabase.from('activities').select('id, action, details, created_at').eq('job_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('time_entries').select('id, description, category, started_at, ended_at, duration_seconds, billable, hourly_rate').eq('job_id', id).order('started_at', { ascending: false }),
  ])

  // Fallback if time-tracking or campaign columns don't exist yet (migration
  // not run on legacy DBs). A missing column fails the whole select, so the
  // retry asks only for what schema.sql guarantees and fills the rest in.
  let job = jobRes.data
  if (!job) {
    const res = await supabase
      .from('jobs')
      .select('id, name, job_type, status, shoot_date, shoot_location, quote_value, revision_limit, revisions_used, notes, client_id, clients(id, name)')
      .eq('id', id)
      .single()
    job = res.data
      ? {
          ...res.data,
          hourly_rate: 0, estimated_hours: 0, expected_amount: null, expected_payment_date: null,
          ad_platform: null, ad_account_ref: null, ad_spend_budget: null,
          campaign_launched_at: null, campaign_ends_at: null, handover_at: null,
        }
      : null
  }

  if (!job) notFound()
  const timeEntries = timeEntriesRes.data ?? []

  const client = job.clients as unknown as { id: string; name: string }

  const jobData = {
    id: job.id,
    name: job.name,
    jobType: job.job_type,
    status: job.status,
    shootDate: job.shoot_date,
    shootLocation: job.shoot_location,
    quoteValue: job.quote_value,
    expectedAmount: job.expected_amount as number | null,
    expectedPaymentDate: (job.expected_payment_date as string | null) ?? null,
    revisionLimit: job.revision_limit,
    revisionsUsed: job.revisions_used,
    hourlyRate: Number(job.hourly_rate ?? 0),
    estimatedHours: Number(job.estimated_hours ?? 0),
    notes: job.notes,
    adPlatform: (job.ad_platform as string | null) ?? null,
    adAccountRef: (job.ad_account_ref as string | null) ?? null,
    adSpendBudget: job.ad_spend_budget !== null && job.ad_spend_budget !== undefined ? Number(job.ad_spend_budget) : null,
    campaignLaunchedAt: (job.campaign_launched_at as string | null) ?? null,
    campaignEndsAt: (job.campaign_ends_at as string | null) ?? null,
    handoverAt: (job.handover_at as string | null) ?? null,
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
      deliveryFiles: ((d.delivery_files as unknown as { id: string; original_name: string; version_label: string; delivery_status: string; created_at: string; file_url: string; personal_note: string | null }[]) ?? []).map((f) => ({
        id: f.id,
        originalName: f.original_name,
        versionLabel: f.version_label,
        deliveryStatus: f.delivery_status,
        createdAt: f.created_at,
        fileUrl: f.file_url,
        personalNote: f.personal_note,
      })),
    })),
    revisions: (revisions ?? []).map((r) => ({
      id: r.id,
      round: r.round,
      request: r.request,
      status: r.status,
      reply: (r.reply as string | null) ?? null,
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
    timeEntries: timeEntries.map((t) => ({
      id: t.id,
      description: t.description,
      category: t.category ?? 'general',
      startedAt: t.started_at,
      endedAt: t.ended_at,
      durationSeconds: t.duration_seconds,
      billable: t.billable ?? true,
      hourlyRate: t.hourly_rate !== null && t.hourly_rate !== undefined ? Number(t.hourly_rate) : null,
    })),
  }

  return <JobRecord job={jobData} />
}
