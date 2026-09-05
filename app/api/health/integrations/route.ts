import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidXeroAccount } from '@/lib/xero'
import { checkMailConnection } from '@/lib/mail'

// Keeps integration_status warm so the assistant never has to probe Xero or
// IMAP on the request path.
//
// This is the only place those two checks should run on a schedule. The
// assistant reads the resulting row (lib/tui/context.ts) and also sees
// checked_at, so if this cron stops the staleness is visible rather than the
// status silently freezing at "connected".
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

  const { error } = await supabase
    .from('integration_status')
    .upsert(rows, { onConflict: 'integration' })

  if (error) {
    console.error('[health] could not write integration_status:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, checked_at: checkedAt, rows })
}
