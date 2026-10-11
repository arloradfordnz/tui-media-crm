import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAssistantTurn } from '@/lib/assistant-agent'

// One assistant turn, triggered by something that actually happened rather
// than by the clock. lib/tui/events.ts calls this from inside after(), so the
// client whose click caused the event never waits on it.
//
// It lives on its own route for the time budget: a server action's duration
// belongs to the visitor waiting on the response, and an assistant turn can
// run half a minute.
// 300, not 60: a contract drafted over Telegram runs a minute or more on its
// own, and 60 was below the project's Fluid default of 300 anyway.
export const maxDuration = 300

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

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The body is a hint about which event woke the turn, not the turn's data.
  // Everything the model reasons from comes from the flag sweep, so a mangled
  // or spoofed body cannot invent a concern that isn't in the CRM.
  let subject: string | undefined
  try {
    const body = await req.json()
    if (typeof body?.subject === 'string') subject = body.subject.slice(0, 300)
  } catch { /* no body is fine */ }

  const supabase = getServiceClient()
  const result = await runAssistantTurn(supabase, { trigger: 'event', eventSubject: subject })

  return NextResponse.json({ ok: true, ran: new Date().toISOString(), ...result })
}
