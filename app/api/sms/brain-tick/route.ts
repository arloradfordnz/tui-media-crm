import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runSmsAgentTurn } from '@/lib/sms-agent'

// Vercel cron target — the proactive half of the SMS assistant. Runs a few
// times a day, reviews the CRM, and texts Arlo only if something actually
// needs his attention. Same auth pattern as the other cron routes.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role credentials missing')
  return createClient(url, key)
}

// This route awaits the full agent loop before responding (no user waiting
// on it — Vercel cron just wants a final status), so give it headroom beyond
// the platform default for the tool-calling rounds to complete.
export const maxDuration = 60

function isAuthorised(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const result = await runSmsAgentTurn(supabase, { trigger: 'tick' })

  return NextResponse.json({ ok: true, ran: new Date().toISOString(), ...result })
}
