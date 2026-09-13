import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deleteObject } from '@/lib/r2'
import { sendTelegramMessage } from '@/lib/telegram'

/**
 * Deletes delivered files from R2 once they are old enough.
 *
 * The free R2 tier stops at 10 GB. One 4K interview is ~250 MB, so at the rate
 * deliveries actually land the bucket fills in well under a year — and the
 * moment it does, storage starts costing money for files every client already
 * downloaded weeks earlier. This keeps the bucket flat.
 *
 * The database row is kept and stamped `archived_at`; only the object goes.
 * The client still sees what was delivered, when, and their approval on it —
 * the player and the download button are what disappear. Re-delivering is a
 * fresh upload against the same deliverable, which is what would happen anyway
 * since the master lives on Arlo's drives, not here.
 */

// Two months. Long enough that a client who sat on a delivery over a holiday
// still gets it; short enough that the bucket never approaches the free cap.
const RETAIN_DAYS = 60

// A file is only archived once the client is done with it. An unapproved
// delivery that is 60 days old is usually one nobody has dealt with yet, and
// pulling it out from under them mid-revision is the one failure mode here
// that costs more than the storage — so those get a longer rope instead.
const RETAIN_DAYS_UNRESOLVED = 120

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

  // ?dryRun=1 lists what would go without touching R2. Worth running once
  // after any change to the windows above.
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const supabase = getServiceClient()
  const now = Date.now()
  const cutoff = new Date(now - RETAIN_DAYS * 86400000).toISOString()
  const cutoffUnresolved = new Date(now - RETAIN_DAYS_UNRESOLVED * 86400000).toISOString()

  // Anything past the longer window goes regardless of status, so a delivery
  // the client never opened cannot pin storage open forever.
  const { data: candidates, error } = await supabase
    .from('delivery_files')
    .select('id, file_name, original_name, size, created_at, delivery_status, approved_at')
    .is('archived_at', null)
    .lt('created_at', cutoffUnresolved)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Files past the short window that the client has finished with.
  const { data: resolved, error: resolvedError } = await supabase
    .from('delivery_files')
    .select('id, file_name, original_name, size, created_at, delivery_status, approved_at')
    .is('archived_at', null)
    .lt('created_at', cutoff)
    .not('approved_at', 'is', null)

  if (resolvedError) {
    return NextResponse.json({ error: resolvedError.message }, { status: 500 })
  }

  const byId = new Map<string, NonNullable<typeof candidates>[number]>()
  for (const f of [...(candidates ?? []), ...(resolved ?? [])]) byId.set(f.id, f)

  // Legacy rows point at Vimeo etc. in file_url and have no R2 object; the
  // upload route always writes an object key into file_name, so anything that
  // looks like a URL is not ours to delete.
  const targets = [...byId.values()].filter((f) => f.file_name && !/^https?:\/\//.test(f.file_name))

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      count: targets.length,
      freedMB: Math.round(targets.reduce((sum, f) => sum + (f.size ?? 0), 0) / 1e6),
      files: targets.map((f) => ({ id: f.id, key: f.file_name, created_at: f.created_at, status: f.delivery_status })),
    })
  }

  const archived: string[] = []
  const failed: { id: string; error: string }[] = []
  let freedBytes = 0

  for (const f of targets) {
    try {
      await deleteObject(f.file_name)
      archived.push(f.id)
      freedBytes += f.size ?? 0
    } catch (e) {
      // Leave archived_at null so the next sweep retries it. A key that is
      // already gone deletes cleanly on R2 (S3 delete is idempotent), so a
      // failure here is a real one — credentials or network.
      failed.push({ id: f.id, error: (e as Error).message })
    }
  }

  if (archived.length) {
    const { error: stampError } = await supabase
      .from('delivery_files')
      .update({ archived_at: new Date().toISOString() })
      .in('id', archived)
    if (stampError) {
      // The objects are gone but the rows still claim they are live, so the
      // portal would offer dead links. Loud, because the next sweep won't
      // catch this — it filters on archived_at.
      console.error('[storage/retention] objects deleted but archived_at not stamped', stampError)
      return NextResponse.json({ error: `Deleted ${archived.length} objects but failed to stamp rows: ${stampError.message}` }, { status: 500 })
    }
  }

  // Only speaks when it actually did something — a sweep that found nothing is
  // not news, and a channel that reports every night gets muted.
  if (archived.length) {
    try {
      await sendTelegramMessage(
        `Storage cleanup: archived ${archived.length} old ${archived.length === 1 ? 'delivery' : 'deliveries'} from R2, freeing ~${(freedBytes / 1e9).toFixed(2)} GB. Clients keep the delivery history; the files are no longer downloadable.`
      )
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    archived: archived.length,
    freedMB: Math.round(freedBytes / 1e6),
    failed,
  })
}
