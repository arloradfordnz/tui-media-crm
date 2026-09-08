// The application form on tuimedia.nz, landing in the CRM.
//
// The rebrand replaced "book a call" with an application: what they sell, what
// a customer is worth, what they'll spend, who signs it off, whether they could
// handle the work. That is precisely the information that decides whether a
// lead is worth a call — and until now all of it went to hello@tuimedia.nz as
// an email and nowhere else, so qualifying a lead meant going back through the
// inbox and the CRM had a client record with a name and nothing behind it.
//
// The site still sends the email (see wireframe/api/enquiry.js in the rebrand
// repo). This endpoint is additive, and deliberately so: if the CRM is down or
// this route changes shape, the enquiry must still reach a human. The site
// treats a failure here as non-fatal and the visitor never sees it.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'

type Payload = {
  name?: string
  business?: string
  email?: string
  sell?: string
  value?: string
  spend?: string
  when?: string
  decision?: string
  capacity?: string
  notes?: string
}

/**
 * The form asks for money in words, not in a number field: "about 1.5k",
 * "$4,500", "5000 a month", "not sure yet". Storing that as text would make it
 * unsortable and unfilterable, and rejecting it would lose the lead — so pull a
 * number out where there is one and keep the raw answer in the notes either way.
 *
 * "1.5k" → 1500. "$4,500" → 4500. "not sure" → null.
 */
function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null
  const match = String(raw).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([km])?/i)
  if (!match) return null
  const n = parseFloat(match[1])
  if (!Number.isFinite(n)) return null
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'k') return n * 1_000
  if (suffix === 'm') return n * 1_000_000
  return n
}

// Constant-time, and length-safe: timingSafeEqual throws on a length mismatch
// rather than returning false, which would turn a wrong-length secret into a
// 500 and a confusing debugging session.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const expected = process.env.ENQUIRY_SECRET
  if (!expected) {
    console.error('ENQUIRY_SECRET is not set — refusing to accept enquiries')
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  }

  // This route writes to the clients table with the service-role key, so it is
  // effectively an unauthenticated write endpoint on the public internet. The
  // shared secret is the only thing standing between the form and someone
  // filling the CRM with junk.
  const provided = req.headers.get('x-enquiry-secret') || ''
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 })
  }

  let body: Payload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const business = String(body.business || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  if (!business || !email) {
    return NextResponse.json({ ok: false, error: 'business and email are required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Supabase service credentials missing')
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  }
  const supabase = createClient(url, key)

  // The free-text answers are kept verbatim as well as parsed. parseMoney turns
  // "about 1.5k" into 1500 for sorting and filtering, but "about" is the part
  // that tells you how firm the number is, and that only survives here.
  const applicationNote = [
    '── Application from tuimedia.nz ──',
    body.name && `Name: ${body.name}`,
    body.sell && `Sells: ${body.sell}`,
    body.value && `Customer worth: ${body.value}`,
    body.spend && `Monthly ad spend: ${body.spend}`,
    body.when && `Wants ads live: ${body.when}`,
    body.decision && `Signs it off: ${body.decision}`,
    body.capacity && `Capacity for more work: ${body.capacity}`,
    body.notes && `Notes: ${body.notes}`,
  ].filter(Boolean).join('\n')

  const fields = {
    name: business,
    contact_person: body.name?.trim() || null,
    email,
    lead_source: 'Website Application',
    first_contact: new Date().toISOString(),
    pipeline_stage: 'enquiry',
    status: 'lead',
    client_category: 'video_ads',
    brand: 'tui_media',
    sells: body.sell?.trim() || null,
    customer_value: parseMoney(body.value),
    ad_spend_budget: parseMoney(body.spend),
    decision_maker: body.decision?.trim() || null,
    capacity: body.capacity?.trim() || null,
    timeline: body.when?.trim() || null,
  }

  // Someone applying twice, or an existing client applying for a second
  // project, must not become a second row — the pipeline would then show two of
  // them and the history would be split across both. Update the existing record
  // instead, and append rather than overwrite the notes so the first
  // application's answers survive the second one.
  const { data: existing } = await supabase
    .from('clients')
    .select('id, notes, status, pipeline_stage')
    .eq('email', email)
    .maybeSingle()

  let clientId: string | null = null

  if (existing) {
    const { error } = await supabase
      .from('clients')
      .update({
        ...fields,
        // Never demote a client who is already won or active back to a lead
        // just because they applied again for a second project.
        status: existing.status === 'lead' ? 'lead' : existing.status,
        pipeline_stage: existing.pipeline_stage === 'won' ? 'won' : 'enquiry',
        notes: [existing.notes, applicationNote].filter(Boolean).join('\n\n'),
      })
      .eq('id', existing.id)
    if (error) {
      console.error('Enquiry update failed', error)
      return NextResponse.json({ ok: false, error: 'Write failed' }, { status: 500 })
    }
    clientId = existing.id
  } else {
    const { data, error } = await supabase
      .from('clients')
      .insert({ ...fields, notes: applicationNote })
      .select('id')
      .single()
    if (error || !data) {
      console.error('Enquiry insert failed', error)
      return NextResponse.json({ ok: false, error: 'Write failed' }, { status: 500 })
    }
    clientId = data.id
  }

  // Best-effort: the enquiry is already saved, and failing the request now
  // would tell the site the write didn't happen when it did.
  const spend = fields.ad_spend_budget
  await Promise.allSettled([
    supabase.from('notifications').insert({
      title: existing ? 'Repeat application' : 'New application',
      message: `${business}${spend ? ` — ${spend.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })}/mo ad spend` : ''}`,
      type: 'enquiry',
      client_id: clientId,
      link_url: `/dashboard/clients/${clientId}`,
    }),
    supabase.from('activities').insert({
      action: 'enquiry_received',
      details: `Application received from ${business}`,
      client_id: clientId,
    }),
  ])

  return NextResponse.json({ ok: true, clientId })
}
