import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { sendMorningBriefingEmail } from '@/lib/email'
import { fetchXeroSummary } from '@/lib/xero'
import { syncClientLifetimeValues } from '@/lib/lifetime-value'

const LAT = -41.2706
const LNG = 173.2840

const WMO: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm',
}

// Service-role client — the cron runs unauthenticated, and todos/events RLS only allows
// authenticated reads, so the previous anon client returned empty arrays silently.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role credentials missing')
  return createClient(url, key)
}

function isAuthorised(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token && token === process.env.BRIEFING_TOKEN) return true
  // Vercel cron requests carry an Authorization: Bearer <CRON_SECRET> header.
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const now = new Date()
  // en-CA locale returns YYYY-MM-DD — use Pacific/Auckland so the date matches NZ wall-clock
  // rather than UTC (at 7am NZST, toISOString() still shows the previous UTC day).
  const nzDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const todayISO = nzDate(now)
  const weekAgoISO = nzDate(new Date(now.getTime() - 7 * 86400000))
  const weekAheadISO = nzDate(new Date(now.getTime() + 7 * 86400000))
  const [nzYear, nzMonth] = todayISO.split('-').map(Number)
  const monthStart = new Date(nzYear, nzMonth - 1, 1).toISOString().split('T')[0]
  const monthEnd = new Date(nzYear, nzMonth, 0).toISOString().split('T')[0]

  const [
    weatherRes,
    todosRes,
    todayEventsRes,
    upcomingRes,
    reviewRes,
    overdueRes,
    weekJobsRes,
    leadsRes,
    pendingRevisionsRes,
    xeroSummary,
  ] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Pacific%2FAuckland`),
    supabase.from('todos').select('title, due_date, jobs:linked_job_id(name)').eq('completed', false).order('due_date', { ascending: true, nullsFirst: false }).limit(20),
    supabase.from('events').select('title, start_time, jobs(name)').gte('date', todayISO).lt('date', new Date(now.getTime() + 86400000).toISOString().split('T')[0]).order('start_time'),
    supabase.from('events').select('title, date, jobs(name)').gt('date', todayISO).lte('date', weekAheadISO).order('date').limit(8),
    supabase.from('jobs').select('name, clients(name)').eq('status', 'review'),
    supabase.from('todos').select('id').eq('completed', false).not('due_date', 'is', null).lt('due_date', todayISO),
    supabase.from('jobs').select('id').gte('updated_at', weekAgoISO).not('status', 'in', '("delivered","archived")'),
    supabase.from('clients').select('id').eq('status', 'lead'),
    // Pending revisions — revisions on jobs still in 'editing' status
    supabase.from('revisions')
      .select('round, request, created_at, jobs(name, status, clients(name))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10),
    fetchXeroSummary().catch((err) => {
      console.error('[morning brief] Xero fetch failed:', err)
      return null
    }),
  ])

  // Daily lifetime-value sync — attribute paid Xero invoices to clients.
  // Best-effort: never fail the briefing over it.
  await syncClientLifetimeValues(supabase).catch((err) => {
    console.error('[morning brief] lifetime value sync failed:', err)
  })

  const raw = weatherRes.ok ? await weatherRes.json() : null
  const weather = raw?.current ? {
    temp: Math.round(raw.current.temperature_2m),
    description: WMO[raw.current.weather_code as number] ?? 'Unknown',
    windKph: Math.round(raw.current.wind_speed_10m),
  } : null

  // ── Pending revisions ─────────────────────────────────────────────────────
  type PendingRevision = {
    round: number
    request: string
    created_at: string
    jobs: { name: string; status: string; clients: { name: string } | null } | null
  }
  const pendingRevisions = ((pendingRevisionsRes.data ?? []) as unknown) as PendingRevision[]

  // ── AI summary (best-effort; never fail the cron) ─────────────────────────
  let aiSummary: string | null = null
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const snapshot = {
        date: todayISO,
        open_todos: (todosRes.data ?? []).length,
        overdue_todos: (overdueRes.data ?? []).length,
        events_today: (todayEventsRes.data ?? []).length,
        jobs_active_this_week: (weekJobsRes.data ?? []).length,
        jobs_in_review: (reviewRes.data ?? []).length,
        pending_revisions: pendingRevisions.length,
        open_leads: (leadsRes.data ?? []).length,
        xero: xeroSummary ? {
          bank_balance_nzd: xeroSummary.bank_balance_nzd,
          outstanding_invoices_nzd: xeroSummary.outstanding_invoices_nzd,
          outstanding_invoice_count: xeroSummary.outstanding_invoice_count,
          overdue_invoices_nzd: xeroSummary.overdue_invoices_nzd,
          revenue_this_month_nzd: xeroSummary.revenue_this_month_nzd,
          net_profit_this_month_nzd: xeroSummary.net_profit_this_month_nzd,
        } : null,
      }
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        system: `You are Arlo's morning advisor for Tui Media (videography/photography/marketing, sole operator, Nelson NZ). Give 1-2 punchy sentences on what to focus on today. Prioritise: overdue items, pending client revisions, overdue invoices. NZ tone, no fluff, no markdown, no greeting.`,
        messages: [
          { role: 'user', content: JSON.stringify(snapshot) },
        ],
      })
      aiSummary = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim() || null
    } catch (err) {
      console.error('[morning brief AI summary failed]', err)
    }
  }

  await sendMorningBriefingEmail({
    date: now,
    weather,
    todos: (todosRes.data ?? []).map((t) => ({
      title: t.title,
      dueDate: t.due_date,
      isOverdue: !!t.due_date && new Date(t.due_date) < now,
      jobName: (t.jobs as unknown as { name: string } | null)?.name ?? null,
    })),
    overdueCount: (overdueRes.data ?? []).length,
    todayEvents: (todayEventsRes.data ?? []).map((e) => ({
      title: e.title,
      startTime: e.start_time,
      jobName: (e.jobs as unknown as { name: string } | null)?.name ?? null,
    })),
    upcomingEvents: (upcomingRes.data ?? []).map((e) => ({
      title: e.title,
      date: e.date,
      jobName: (e.jobs as unknown as { name: string } | null)?.name ?? null,
    })),
    reviewJobs: (reviewRes.data ?? []).map((j) => ({
      name: j.name,
      clientName: (j.clients as unknown as { name: string } | null)?.name ?? null,
    })),
    weekJobCount: (weekJobsRes.data ?? []).length,
    xero: xeroSummary,
    pendingRevisions: pendingRevisions.map((r) => ({
      round: r.round,
      request: r.request,
      jobName: (r.jobs as unknown as { name: string } | null)?.name ?? null,
      clientName: (r.jobs as unknown as { clients: { name: string } | null } | null)?.clients?.name ?? null,
    })),
    aiSummary,
  })

  return NextResponse.json({
    ok: true,
    sent: new Date().toISOString(),
    counts: {
      todos: (todosRes.data ?? []).length,
      todayEvents: (todayEventsRes.data ?? []).length,
      upcomingEvents: (upcomingRes.data ?? []).length,
      reviewJobs: (reviewRes.data ?? []).length,
      pendingRevisions: pendingRevisions.length,
      xeroConnected: !!xeroSummary,
    },
  })
}
