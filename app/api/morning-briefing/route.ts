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
  const twoWeeksAheadISO = nzDate(new Date(now.getTime() + 14 * 86400000))

  const [
    weatherRes,
    todosRes,
    todayEventsRes,
    retainerRes,
    reviewRes,
    weekJobsRes,
    leadsRes,
    pendingRevisionsRes,
    xeroSummary,
  ] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Pacific%2FAuckland`),
    supabase.from('todos').select('title, due_date, jobs:linked_job_id(name)').eq('completed', false).order('due_date', { ascending: true, nullsFirst: false }).limit(20),
    supabase.from('events').select('title, start_time, jobs(name)').gte('date', todayISO).lt('date', new Date(now.getTime() + 86400000).toISOString().split('T')[0]).order('start_time'),
    // Active retainer clients — the calendar shows when each is due to be filmed,
    // derived from shoots_per_month (not one-off booked events).
    supabase.from('clients').select('id, name, shoots_per_month').eq('client_category', 'retainer').neq('status', 'archived'),
    supabase.from('jobs').select('name, clients(name)').eq('status', 'review'),
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

  // ── Retainer filming schedule (next fortnight) — powers the calendar + hook. ──
  // Each retainer client shoots on a monthly cadence set by shoots_per_month.
  // SHOOT_WEEKS maps that to which weeks of the month get a shoot (week 1 = 1st,
  // 2 = 8th, 3 = 15th, 4 = 22nd) — the same rule the dashboard schedule uses.
  const SHOOT_WEEKS: Record<number, number[]> = { 1: [2], 2: [1, 3], 3: [1, 2, 4], 4: [1, 2, 3, 4] }
  const cadenceLabel = (spm: number) =>
    spm >= 4 ? 'Weekly' : spm === 3 ? '3× / month' : spm === 2 ? 'Fortnightly' : 'Monthly'
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const [nzY, nzM] = todayISO.split('-').map(Number)
  const retainerClients = (retainerRes.data ?? []) as unknown as { id: string; name: string; shoots_per_month: number | null }[]
  const upcomingShoots = retainerClients
    .flatMap((c) => {
      const spm = Math.min(Math.max(c.shoots_per_month ?? 1, 1), 4)
      const weeks = SHOOT_WEEKS[spm] ?? [2]
      const out: { title: string; date: string; jobName: string | null }[] = []
      // current + next month covers any 14-day window that straddles a month end
      for (let mo = 0; mo <= 1; mo++) {
        const tm = (nzM - 1) + mo
        const yy = nzY + Math.floor(tm / 12)
        const mm = (tm % 12) + 1
        for (const w of weeks) {
          const iso = `${yy}-${pad2(mm)}-${pad2((w - 1) * 7 + 1)}`
          if (iso >= todayISO && iso <= twoWeeksAheadISO) {
            out.push({ title: c.name, date: iso, jobName: cadenceLabel(spm) })
          }
        }
      }
      return out
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── AI summary (best-effort; never fail the cron) ─────────────────────────
  let aiSummary: string | null = null
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const snapshot = {
        date: todayISO,
        events_today: (todayEventsRes.data ?? []).length,
        upcoming_shoots: upcomingShoots.length,
        next_shoot: upcomingShoots[0] ? { title: upcomingShoots[0].title, date: upcomingShoots[0].date } : null,
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
        system: `You are Arlo's morning advisor for Tui Media (videography/photography/marketing, sole operator, Nelson NZ). Give 1-2 punchy sentences on what to focus on today. Prioritise pending client revisions, overdue invoices, and prepping upcoming shoots. NZ tone, no fluff, no markdown, no greeting, no em dashes.`,
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

  // ── One news story — top AI / creative-tech item from Hacker News, summarised. ─
  // Best-effort: a null result simply hides the section.
  let news: { headline: string; summary: string } | null = null
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
      const ids: number[] = topRes.ok ? ((await topRes.json()) as number[]).slice(0, 20) : []
      const items = await Promise.all(
        ids.map((id) =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json()).catch(() => null)),
      )
      const stories = items
        .filter((s): s is { type: string; title: string } => !!s && s.type === 'story' && !!s.title)
        .map((s) => ({ title: s.title }))
      if (stories.length) {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: `Arlo is a 16-year-old founder in Nelson NZ running a video/photo/marketing company and building AI products. From these Hacker News headlines, pick the SINGLE most relevant story for someone at the intersection of AI and creative media. Reply as strict JSON only, no code fences: {"headline":"<max 9 words>","summary":"<one punchy sentence on what it is and why it matters to him>"}. NZ tone, no fluff, no markdown, no em dashes.`,
          messages: [{ role: 'user', content: JSON.stringify(stories) }],
        })
        const text = msg.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim()
        const match = text.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          if (parsed.headline && parsed.summary) {
            news = { headline: String(parsed.headline), summary: String(parsed.summary) }
          }
        }
      }
    } catch (err) {
      console.error('[morning brief news failed]', err)
    }
  }

  await sendMorningBriefingEmail({
    date: now,
    weather,
    xero: xeroSummary,
    upcomingShoots,
    news,
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
      retainerShoots: upcomingShoots.length,
      reviewJobs: (reviewRes.data ?? []).length,
      pendingRevisions: pendingRevisions.length,
      xeroConnected: !!xeroSummary,
    },
  })
}
