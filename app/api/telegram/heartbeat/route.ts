import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAssistantTurn } from '@/lib/assistant-agent'
import { sendTelegramMessage } from '@/lib/telegram'

// Daily heartbeat — the one guaranteed message per day. brain-tick is
// deliberately silent when there's nothing to flag, which means a broken
// integration (expired Anthropic key, dead Xero token, IMAP down) looks
// identical to "all quiet". This route exists specifically to close that
// blind spot: it always sends something, and if the AI-driven path itself
// fails outright, the catch block below sends a plain, non-AI status
// message directly — so a total outage still reaches Arlo instead of
// disappearing into a silent cron failure.
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

  try {
    const supabase = getServiceClient()
    const result = await runAssistantTurn(supabase, { trigger: 'heartbeat' })
    return NextResponse.json({ ok: true, ran: new Date().toISOString(), ...result })
  } catch (err) {
    console.error('[telegram/heartbeat] Failed outright:', err)
    const message = err instanceof Error ? err.message : String(err)
    // Deliberately bypasses runAssistantTurn/Anthropic — if that's what's
    // broken, this is the only path left that can still reach Telegram.
    await sendTelegramMessage(`Daily check-in failed to run: ${message}. Something's broken, worth checking the logs.`).catch(() => {})
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
