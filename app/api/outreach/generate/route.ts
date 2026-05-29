import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const MAX_DRAFTS_PER_RUN = 5

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  const supabase = getServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Load business info for context
  const { data: businessSections } = await supabase
    .from('business_info')
    .select('section, content')
    .order('section')

  const businessContext = (businessSections ?? [])
    .filter((s) => s.content?.trim())
    .map((s) => `${s.section}:\n${s.content}`)
    .join('\n\n')

  // Find leads that don't already have a draft created today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: existingDraftsToday } = await supabase
    .from('activities')
    .select('client_id')
    .in('action', ['outreach_draft', 'outreach_archived'])
    .gte('created_at', todayStart.toISOString())

  const alreadyDraftedToday = new Set(
    (existingDraftsToday ?? []).map((r) => r.client_id).filter(Boolean)
  )

  // Fetch all leads with an email who haven't been drafted today
  const { data: leads, error: leadsError } = await supabase
    .from('clients')
    .select('id, name, email, contact_person, location, notes')
    .eq('status', 'lead')
    .not('email', 'is', null)
    .order('created_at', { ascending: true })

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 })
  }

  const eligible = (leads ?? [])
    .filter((c) => c.email && !alreadyDraftedToday.has(c.id))
    .slice(0, MAX_DRAFTS_PER_RUN)

  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, count: 0, message: 'No new leads to draft for today' })
  }

  // Generate a draft for each eligible lead
  const results: { clientId: string; name: string; ok: boolean; error?: string }[] = []

  for (const lead of eligible) {
    try {
      const categoryMatch = lead.notes?.match(/Category:\s*([^.\n]+)/)
      const category = categoryMatch?.[1]?.trim() ?? ''
      const recipientName = lead.contact_person || lead.name

      const prompt = `You are writing a cold outreach email on behalf of Arlo Radford at Tui Media — a videography, photography, and marketing business based in Nelson, NZ.

BUSINESS CONTEXT:
${businessContext || 'Tui Media is a sole-operator creative business based in Nelson, NZ. Arlo specialises in wedding videography, commercial video, and photography.'}

PROSPECT DETAILS:
- Name/Business: ${lead.name}
- Contact person: ${lead.contact_person || 'unknown'}
- Location: ${lead.location || 'NZ'}
- Category: ${category || 'general'}
- Email: ${lead.email}

Write a short, genuine, warm cold outreach email from Arlo. It should:
- Feel personal and specific to this prospect — not like a template blast
- Be concise (3–4 short paragraphs max)
- Open with something relevant to their business or category, not a generic compliment
- Briefly mention what Tui Media does and why it's relevant to them
- End with a soft, low-pressure CTA (e.g. "happy to jump on a call" or "send over some examples")
- Use NZ English, relaxed professional tone — no buzzwords, no fluff
- NOT use "I hope this email finds you well" or similar clichés
- Sign off as Arlo, not "the Tui Media team"

Format your response EXACTLY like this (no extra commentary, just the email):
SUBJECT: [subject line here]
TO: ${lead.email}
BODY:
[email body here]`

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      // Validate it has the expected format
      if (!text.startsWith('SUBJECT:')) {
        throw new Error('Unexpected Claude response format')
      }

      const { error: insertError } = await supabase.from('activities').insert({
        action: 'outreach_draft',
        client_id: lead.id,
        details: text,
      })

      if (insertError) throw new Error(insertError.message)

      results.push({ clientId: lead.id, name: lead.name, ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[outreach/generate] Failed for ${lead.name}:`, err)
      results.push({ clientId: lead.id, name: lead.name, ok: false, error: message })
    }
  }

  const succeeded = results.filter((r) => r.ok).length

  return NextResponse.json({
    ok: succeeded > 0 || eligible.length === 0,
    count: succeeded,
    total: eligible.length,
    failed: results.filter((r) => !r.ok),
    results,
  })
}
