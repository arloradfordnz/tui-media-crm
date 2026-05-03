import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { sendMorningBriefingEmail } from '@/lib/email'

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
  const todayISO = now.toISOString().split('T')[0]
  const weekAgoISO = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
  const weekAheadISO = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const [
    weatherRes,
    todosRes,
    todayEventsRes,
    upcomingRes,
    reviewRes,
    overdueRes,
    weekJobsRes,
    incomeJobsRes,
    leadsRes,
  ] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Pacific%2FAuckland`),
    supabase.from('todos').select('title, due_date, jobs:linked_job_id(name)').eq('completed', false).order('due_date', { ascending: true, nullsFirst: false }).limit(20),
    supabase.from('events').select('title, start_time, jobs(name)').gte('date', todayISO).lt('date', new Date(now.getTime() + 86400000).toISOString().split('T')[0]).order('start_time'),
    supabase.from('events').select('title, date, jobs(name)').gt('date', todayISO).lte('date', weekAheadISO).order('date').limit(8),
    supabase.from('jobs').select('name, clients(name)').eq('status', 'review'),
    supabase.from('todos').select('id').eq('completed', false).not('due_date', 'is', null).lt('due_date', todayISO),
    supabase.from('jobs').select('id').gte('updated_at', weekAgoISO).not('status', 'in', '("delivered","archived")'),
    // Pull every unpaid job with predicted-income fields. Falls back to an empty list if
    // the migration_morning_brief.sql columns aren't in the database yet.
    supabase.from('jobs').select('name, status, quote_value, expected_amount, expected_payment_date, paid_at, clients(name)').is('paid_at', null).not('status', 'eq', 'archived').then(
      (r) => r,
      () => ({ data: [], error: { message: 'income query failed' } } as { data: unknown[]; error: { message: string } }),
    ),
    supabase.from('clients').select('id').eq('status', 'lead'),
  ])

  const raw = weatherRes.ok ? await weatherRes.json() : null
  const weather = raw?.current ? {
    temp: Math.round(raw.current.temperature_2m),
    description: WMO[raw.current.weather_code as number] ?? 'Unknown',
    windKph: Math.round(raw.current.wind_speed_10m),
  } : null

  // ── Income forecast ───────────────────────────────────────────────────────
  type IncomeJob = {
    name: string
    status: string
    quote_value: number | null
    expected_amount: number | null
    expected_payment_date: string | null
    clients: { name: string } | null
  }
  if (incomeJobsRes.error) {
    console.warn('[morning brief] income query skipped — run supabase/migration_morning_brief.sql:', incomeJobsRes.error.message)
  }
  const incomeJobs = ((incomeJobsRes.data ?? []) as unknown) as IncomeJob[]

  const amountFor = (j: IncomeJob) => Number(j.expected_amount ?? j.quote_value ?? 0)
  const inRange = (date: string | null, fromISO: string, toISO: string) =>
    !!date && date >= fromISO && date <= toISO

  const expectedThisWeek = incomeJobs
    .filter((j) => inRange(j.expected_payment_date, todayISO, weekAheadISO))
    .reduce((sum, j) => sum + amountFor(j), 0)

  const expectedThisMonth = incomeJobs
    .filter((j) => inRange(j.expected_payment_date, monthStart, monthEnd))
    .reduce((sum, j) => sum + amountFor(j), 0)

  const upcomingPayments = incomeJobs
    .filter((j) => j.expected_payment_date && j.expected_payment_date >= todayISO)
    .sort((a, b) => (a.expected_payment_date ?? '').localeCompare(b.expected_payment_date ?? ''))
    .slice(0, 5)
    .map((j) => ({
      name: j.name,
      clientName: j.clients?.name ?? null,
      amount: amountFor(j),
      dueDate: j.expected_payment_date!,
    }))

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
        events_this_week: (upcomingRes.data ?? []).length,
        jobs_active_this_week: (weekJobsRes.data ?? []).length,
        jobs_in_review: (reviewRes.data ?? []).length,
        new_leads_open: (leadsRes.data ?? []).length,
        income_expected_this_week_nzd: Math.round(expectedThisWeek),
        income_expected_this_month_nzd: Math.round(expectedThisMonth),
        upcoming_payments: upcomingPayments.map((p) => ({ job: p.name, amount: p.amount, due: p.dueDate })),
      }
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: `You are Arlo's morning advisor for Tui Media (videography, photography and marketing — sole operator, Nelson NZ). Read the snapshot and give 2-4 short sentences of practical focus for the day: what to prioritise, what to nudge forward, and one specific business-health observation if anything stands out (cashflow gap, stale review, lead drought, etc). NZ tone, direct, no filler, no markdown, no greetings.`,
        messages: [
          { role: 'user', content: `Today's snapshot:\n\n${JSON.stringify(snapshot, null, 2)}` },
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
    income: {
      expectedThisWeek,
      expectedThisMonth,
      upcomingPayments,
    },
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
      upcomingPayments: upcomingPayments.length,
    },
  })
}
