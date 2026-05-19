import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendLeadFinderEmail } from '@/lib/email'

function isAuthorised(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token && token === process.env.BRIEFING_TOKEN) return true
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase credentials missing' }, { status: 500 })

  const supabase = createClient(url, key)
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('activities')
    .select('details, clients(name, email, location, notes)')
    .eq('action', 'outreach_draft')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type ActivityRow = {
    details: string | null
    clients: { name: string; email: string | null; location: string | null; notes: string | null } | null
  }

  const leads = ((data ?? []) as unknown as ActivityRow[]).map((activity) => {
    const details = activity.details ?? ''
    const subjectMatch = details.match(/^SUBJECT:\s*(.+)/m)
    const toMatch = details.match(/^TO:\s*(.+)/m)
    const client = activity.clients
    const categoryMatch = client?.notes?.match(/Category:\s*([^.]+)/)

    return {
      prospectName: client?.name ?? 'Unknown',
      location: client?.location ?? '',
      category: categoryMatch?.[1]?.trim() ?? '',
      email: toMatch?.[1]?.trim() || client?.email || null,
      subject: subjectMatch?.[1]?.trim() ?? '',
    }
  })

  await sendLeadFinderEmail(leads, now)

  return NextResponse.json({ ok: true, sent: now.toISOString(), count: leads.length })
}
