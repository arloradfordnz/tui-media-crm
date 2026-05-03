import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendDeliveryReminderEmail } from '@/lib/email'

const REMIND_AFTER_DAYS = 3   // Wait this long after the client first viewed.
const COOLDOWN_DAYS = 5       // Don't re-remind more often than this.

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role credentials missing')
  return createClient(url, key)
}

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

  const supabase = getServiceClient()
  const now = new Date()
  const remindCutoff = new Date(now.getTime() - REMIND_AFTER_DAYS * 86400000).toISOString()
  const cooldownCutoff = new Date(now.getTime() - COOLDOWN_DAYS * 86400000).toISOString()

  const { data: candidates, error } = await supabase
    .from('delivery_files')
    .select('id, original_name, viewed_at, last_reminded_at, deliverables(job_id, jobs(name, portal_token, clients(name, email, id)))')
    .eq('delivery_status', 'sent')
    .not('viewed_at', 'is', null)
    .is('approved_at', null)
    .lt('viewed_at', remindCutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = {
    id: string
    original_name: string
    viewed_at: string
    last_reminded_at: string | null
    deliverables: {
      job_id: string
      jobs: {
        name: string
        portal_token: string
        clients: { id: string; name: string; email: string | null } | null
      } | null
    } | null
  }

  const rows = ((candidates ?? []) as unknown) as Row[]
  const sent: { jobName: string; to: string }[] = []
  const skipped: { reason: string; file: string }[] = []

  for (const row of rows) {
    const job = row.deliverables?.jobs
    const client = job?.clients
    if (!job || !client?.email) {
      skipped.push({ reason: 'missing client email', file: row.original_name })
      continue
    }
    if (row.last_reminded_at && row.last_reminded_at > cooldownCutoff) {
      skipped.push({ reason: 'within cooldown', file: row.original_name })
      continue
    }

    const daysSinceViewed = Math.max(1, Math.floor((now.getTime() - new Date(row.viewed_at).getTime()) / 86400000))
    const portalUrl = `https://dashboard.tuimedia.nz/portal/client/${job.portal_token}`

    await sendDeliveryReminderEmail(
      client.email,
      client.name,
      job.name,
      portalUrl,
      daysSinceViewed,
      client.id,
      row.deliverables?.job_id,
    )

    await supabase.from('delivery_files').update({ last_reminded_at: now.toISOString() }).eq('id', row.id)
    sent.push({ jobName: job.name, to: client.email })
  }

  return NextResponse.json({ ok: true, sent, skipped, checked: rows.length })
}
