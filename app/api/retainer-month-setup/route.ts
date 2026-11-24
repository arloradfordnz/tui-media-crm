import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { secretMatches, hasCronBearer } from '@/lib/secure-compare'
import { runMonthSetup } from '@/lib/month-setup'

// Daily (vercel.json, 17:00 UTC, early morning in New Zealand). Makes each
// active retainer's content job for the current month and checks Xero is
// billing it. Idempotent: on most days it finds every month already set up and
// only refreshes the billing check. See lib/month-setup.ts.
//
// ?dry=1 reports what it would make without writing anything.

export const maxDuration = 60

function isAuthorised(req: NextRequest) {
  if (secretMatches(req.nextUrl.searchParams.get('token'), process.env.BRIEFING_TOKEN)) return true
  return hasCronBearer(req)
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase service role credentials missing' }, { status: 500 })
  const admin = createClient(url, key, { auth: { persistSession: false } })

  try {
    const report = await runMonthSetup(admin, { dryRun: req.nextUrl.searchParams.get('dry') === '1' })
    // `done` is bookkeeping, not news.
    const { done: _done, ...summary } = report
    void _done
    return NextResponse.json(summary)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
