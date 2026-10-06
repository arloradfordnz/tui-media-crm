import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getAuthUser } from '@/lib/supabase-admin'
import { syncClientMail } from '@/lib/client-mail'

// Read the inbox and file client mail now, ignoring the five-minute throttle.
// The dashboard does this itself on load; this exists for a manual run
// (signed in as Arlo) or a cron (bearer CRON_SECRET) to force one.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const bearer = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!bearer && !(await getAuthUser())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role key missing' }, { status: 500 })
  return NextResponse.json(await syncClientMail(admin, { force: true }))
}
