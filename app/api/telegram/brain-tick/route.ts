import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAssistantTurn } from '@/lib/assistant-agent'

// The afternoon safety net. Runs once (2pm NZ), reviews the CRM, and messages
// Arlo only if something is actually due.
//
// This used to run seven times a day, polling for changes. Client actions are
// pushed now (lib/tui/events.ts), so what is left on a timer is only what
// accrues with time rather than with events: an invoice crossing its due date,
// a lead going quiet, a job sitting untouched. See CRONS.md.
//
// Same auth pattern as the other cron routes.
export const maxDuration = 60

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role credentials missing')
  return createClient(url, key)
}

function isAuthorised(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const result = await runAssistantTurn(supabase, { trigger: 'tick' })

  return NextResponse.json({ ok: true, ran: new Date().toISOString(), ...result })
}
