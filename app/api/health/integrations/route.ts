import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidXeroAccount } from '@/lib/xero'
import { checkMailConnection } from '@/lib/mail'
import { sendTelegramMessage } from '@/lib/telegram'

// Keeps integration_status warm so the assistant never has to probe Xero or
// IMAP on the request path — and is now the only thing that texts Arlo without
// being asked.
//
// It replaces the daily heartbeat, which existed to make outages visible but
// paid for it by sending a message every single day whether or not anything
// was wrong. That is the same trade the proactive brain-tick made, and both
// ended up as noise: six near-identical texts in a week, still chasing August
// content in September, still naming a client who had been dropped a month
// earlier. A channel that speaks daily regardless of the news gets muted, and
// then it cannot deliver the one message that mattered.
//
// So this speaks on the EDGE only: when an integration goes from working to
// broken, and when it comes back. A month of everything being fine is a month
// of silence.
//
// This is the only place those two checks should run on a schedule. The
// assistant reads the resulting row (lib/tui/context.ts) and also sees
// checked_at, so if this cron stops the staleness is visible rather than the
// status silently freezing at "connected".
export const maxDuration = 60

// Plain names, because this text arrives on a phone with no other context.
const LABELS: Record<string, string> = {
  xero: 'Xero',
  email: 'The hello@ mailbox',
}

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
  const checkedAt = new Date().toISOString()

  // Each check is independently best-effort: Xero being down must not stop us
  // recording that mail is up.
  const [xeroAccount, mailOk] = await Promise.all([
    getValidXeroAccount().catch((err) => {
      console.error('[health] xero check failed:', err)
      return null
    }),
    checkMailConnection().catch((err) => {
      console.error('[health] mail check failed:', err)
      return false
    }),
  ])

  const rows = [
    {
      integration: 'xero',
      ok: !!xeroAccount,
      checked_at: checkedAt,
      // Deliberately no token, tenant id or account detail — this row is read
      // straight into a model prompt.
      detail: xeroAccount ? null : 'No valid Xero account — needs reconnecting at /dashboard/finance.',
    },
    {
      integration: 'email',
      ok: mailOk,
      checked_at: checkedAt,
      detail: mailOk ? null : 'IMAP login failed — check EMAIL_IMAP_* credentials.',
    },
  ]

  // Read before write: the edge is the difference between these two.
  const { data: previous } = await supabase
    .from('integration_status')
    .select('integration, ok')
  const wasOk = new Map<string, boolean>((previous ?? []).map((r: { integration: string; ok: boolean }) => [r.integration, r.ok]))

  const { error } = await supabase
    .from('integration_status')
    .upsert(rows, { onConflict: 'integration' })

  if (error) {
    console.error('[health] could not write integration_status:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // A row with no previous state is the first run after deploy. Treat that as
  // "no change" rather than announcing the state of everything — otherwise the
  // first check after every schema reset is a burst of texts about nothing.
  const broke = rows.filter((r) => !r.ok && wasOk.get(r.integration) === true)
  const fixed = rows.filter((r) => r.ok && wasOk.get(r.integration) === false)

  const lines = [
    ...broke.map((r) => `${LABELS[r.integration] ?? r.integration} just stopped working. ${r.detail ?? ''}`.trim()),
    ...fixed.map((r) => `${LABELS[r.integration] ?? r.integration} is back.`),
  ]

  if (lines.length) {
    // Failure to notify is worth a log line but not a failed cron — the status
    // row is already written, and the dashboard reads that.
    await sendTelegramMessage(lines.join('\n')).catch((err) =>
      console.error('[health] alert send failed:', err)
    )
  }

  return NextResponse.json({ ok: true, checked_at: checkedAt, rows, alerted: lines })
}
