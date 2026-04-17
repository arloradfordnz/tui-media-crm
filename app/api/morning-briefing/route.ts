import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendMorningBriefingEmail } from '@/lib/email'

const LAT = -41.2706
const LNG = 173.2840

const WMO: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm',
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('token') !== process.env.BRIEFING_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const todayISO = now.toISOString().split('T')[0]
  const weekAgoISO = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
  const weekAheadISO = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0]

  const [weatherRes, todosRes, todayEventsRes, upcomingRes, reviewRes, overdueRes, weekJobsRes] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Pacific%2FAuckland`),
    supabase.from('todos').select('title, due_date, jobs:linked_job_id(name)').eq('completed', false).order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('events').select('title, start_time, jobs(name)').eq('date', todayISO).order('start_time'),
    supabase.from('events').select('title, date, jobs(name)').gt('date', todayISO).lte('date', weekAheadISO).order('date').limit(8),
    supabase.from('jobs').select('name, clients(name)').eq('status', 'review'),
    supabase.from('todos').select('id').eq('completed', false).not('due_date', 'is', null).lt('due_date', todayISO),
    supabase.from('jobs').select('id').gte('updated_at', weekAgoISO).not('status', 'in', '("delivered","archived")'),
  ])

  const raw = weatherRes.ok ? await weatherRes.json() : null
  const weather = raw?.current ? {
    temp: Math.round(raw.current.temperature_2m),
    description: WMO[raw.current.weather_code as number] ?? 'Unknown',
    windKph: Math.round(raw.current.wind_speed_10m),
  } : null

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
  })

  return NextResponse.json({ ok: true, sent: new Date().toISOString() })
}
