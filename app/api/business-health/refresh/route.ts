import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const headerAuth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && headerAuth === `Bearer ${cronSecret}`) return true
  const token = process.env.BRIEFING_TOKEN
  if (!token) return false
  if (headerAuth === `Bearer ${token}`) return true
  if (req.nextUrl.searchParams.get('token') === token) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const force = req.nextUrl.searchParams.get('force') === '1'
  if (!force) {
    const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('business_health_reports')
      .select('id, generated_at')
      .gte('generated_at', twelveHoursAgo)
      .limit(1)
      .maybeSingle()
    if (recent) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'recent report exists', recent })
    }
  }

  const now = new Date()
  const todayISO = now.toISOString().split('T')[0]
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString()

  const [
    { data: deliveredMonth },
    { data: deliveredPrev },
    { data: pipelineJobs },
    { count: leadsInPipeline },
    { count: jobsInReview },
    { count: overdueTodos },
    { count: newClientsMonth },
    { data: recentActivity },
  ] = await Promise.all([
    supabase.from('jobs').select('quote_value, updated_at').eq('status', 'delivered').gte('updated_at', startOfMonth),
    supabase.from('jobs').select('quote_value, updated_at').eq('status', 'delivered').gte('updated_at', ninetyDaysAgo).lt('updated_at', startOfMonth),
    supabase.from('jobs').select('status, quote_value'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).in('pipeline_stage', ['enquiry', 'discovery']),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('todos').select('*', { count: 'exact', head: true }).eq('completed', false).not('due_date', 'is', null).lt('due_date', todayISO),
    supabase.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
    supabase.from('activities').select('action, created_at').gte('created_at', thirtyDaysAgo),
  ])

  const revenueMonth = (deliveredMonth ?? []).reduce((s, j) => s + (j.quote_value || 0), 0)
  const revenuePrevAvg = ((deliveredPrev ?? []).reduce((s, j) => s + (j.quote_value || 0), 0)) / 2 // 2 prior months avg
  const pipelineValue = (pipelineJobs ?? [])
    .filter((j) => !['delivered', 'archived'].includes(j.status))
    .reduce((s, j) => s + ((j as { quote_value?: number }).quote_value || 0), 0)
  const activeJobs = (pipelineJobs ?? []).filter((j) => !['delivered', 'archived'].includes(j.status)).length

  const signals = {
    date: todayISO,
    revenue_this_month_nzd: revenueMonth,
    revenue_prior_3mo_avg_nzd: Math.round(revenuePrevAvg),
    pipeline_value_nzd: pipelineValue,
    active_jobs: activeJobs,
    leads_in_pipeline: leadsInPipeline ?? 0,
    jobs_awaiting_review: jobsInReview ?? 0,
    overdue_todos: overdueTodos ?? 0,
    new_clients_this_month: newClientsMonth ?? 0,
    activity_events_last_30d: (recentActivity ?? []).length,
    integrations: {
      xero: { connected: false },
      instagram: { connected: false },
      facebook: { connected: false },
      google_reviews: { connected: false },
    },
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: `You are a business health analyst for Tui Media (videography/photography, Nelson NZ — sole operator Arlo Radford).
Your job: read the daily snapshot and produce a tight, honest assessment.

Output strict JSON only, no prose outside the JSON. Schema:
{
  "score": <integer 0-100, overall health>,
  "headline": "<one sentence, 12 words max>",
  "summary": "<2-4 sentences, plain English, NZ tone, professional and direct>"
}

Scoring rubric:
- Revenue trend vs prior months (heavy weight)
- Pipeline volume and value (medium)
- Operational hygiene: overdue todos, jobs stuck in review (medium — penalise)
- Lead flow + new clients (light)

Note any disconnected integrations briefly so the user sees what they're missing — but don't dwell.
Avoid hedging language. Be specific with numbers. No emojis. No markdown. JSON only.`,
    messages: [
      { role: 'user', content: `Today's snapshot:\n\n${JSON.stringify(signals, null, 2)}` },
    ],
  })

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Model did not return JSON', raw: text }, { status: 502 })
  }

  let parsed: { score?: number; headline?: string; summary?: string }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Invalid JSON from model', raw: text }, { status: 502 })
  }

  const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null
  const headline = (parsed.headline ?? '').toString().slice(0, 200)
  const summary = (parsed.summary ?? '').toString().slice(0, 2000)

  if (!summary) {
    return NextResponse.json({ error: 'Model returned empty summary', raw: text }, { status: 502 })
  }

  const { data: inserted, error } = await supabase
    .from('business_health_reports')
    .insert({ score, headline, summary, signals })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, report: inserted })
}
