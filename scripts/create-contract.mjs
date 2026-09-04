#!/usr/bin/env node
// Creates a Tui Media contract document directly in Supabase, in the exact
// shape the CRM's own document editor writes (documents.content =
// JSON.stringify({ template: 'Contract', form })) — so it renders correctly
// in both /dashboard/documents/[id] and the client's portal immediately,
// with no manual step in the CRM UI.
//
// Usage: node scripts/create-contract.mjs payload.json
//
// Payload shape:
// {
//   "client": { "id": "<uuid>" }                              // use an existing client, OR
//   "client": { "name": "Acme Ltd", "create": true, ... }      // create a new one, OR
//   "client": { "name": "Acme Ltd" }                           // look up by exact name
//   "businessName": "Acme Ltd",
//   "date": "2026-08-25",
//   "shootDate": "2026-09-10",
//   "jobDescription": "One short line describing the project",
//   "location": "Nelson",
//   "body": "# Scope of Work\n...markdown body using the app's # ## ### ** conventions...",
//   "documentNumber": "#142",   // optional — auto-assigned (next in sequence) if omitted
//   "docName": "Contract - Acme Ltd"  // optional — defaults to "Contract - <clientName>"
// }

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function fail(message) {
  console.error(`create-contract: ${message}`)
  process.exit(1)
}

const payloadPath = process.argv[2]
if (!payloadPath) fail('missing payload path. Usage: node scripts/create-contract.mjs payload.json')

let payload
try {
  payload = JSON.parse(readFileSync(payloadPath, 'utf8'))
} catch (err) {
  fail(`could not read/parse payload at ${payloadPath}: ${err.message}`)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — check .env')

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function resolveClient(spec) {
  if (!spec || (!spec.id && !spec.name)) {
    fail('payload.client must include an "id" or a "name"')
  }

  if (spec.id) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', spec.id).single()
    if (error || !data) fail(`no client found with id ${spec.id}`)
    return data
  }

  const { data: matches, error } = await supabase
    .from('clients')
    .select('*')
    .ilike('name', spec.name)
  if (error) fail(`client lookup failed: ${error.message}`)

  if (matches && matches.length === 1) return matches[0]
  if (matches && matches.length > 1) {
    fail(`multiple clients named "${spec.name}" — pass payload.client.id to disambiguate (${matches.map((m) => m.id).join(', ')})`)
  }

  if (!spec.create) {
    fail(`no client named "${spec.name}" found — pass payload.client.id for an existing client, or set payload.client.create: true to create one`)
  }

  const { data: created, error: createError } = await supabase
    .from('clients')
    .insert({
      name: spec.name,
      contact_person: spec.contactPerson || null,
      email: spec.email || null,
      phone: spec.phone || null,
      location: spec.location || null,
      status: 'active',
    })
    .select('*')
    .single()
  if (createError || !created) fail(`could not create client: ${createError?.message}`)
  return created
}

async function nextDocumentNumber() {
  const { data } = await supabase.from('documents').select('content')
  let max = 99
  for (const row of data ?? []) {
    if (!row.content) continue
    try {
      const obj = JSON.parse(row.content)
      const n = obj?.form?.documentNumber
      const m = typeof n === 'string' ? n.match(/^#(\d+)$/) : null
      if (m) {
        const num = parseInt(m[1], 10)
        if (Number.isFinite(num) && num > max) max = num
      }
    } catch { /* not JSON, skip */ }
  }
  return `#${max + 1}`
}

async function main() {
  const client = await resolveClient(payload.client)

  let portalToken = client.portal_token
  if (!portalToken) {
    const { data: updated, error } = await supabase
      .from('clients')
      .update({ portal_token: crypto.randomUUID() })
      .eq('id', client.id)
      .select('portal_token')
      .single()
    if (error || !updated) fail(`client has no portal_token and one could not be generated: ${error?.message}`)
    portalToken = updated.portal_token
  }

  const documentNumber = payload.documentNumber || (await nextDocumentNumber())

  const form = {
    clientName: client.name,
    contactPerson: payload.contactPerson || client.contact_person || '',
    clientEmail: payload.clientEmail || client.email || '',
    clientPhone: payload.clientPhone || client.phone || '',
    businessName: payload.businessName || client.name,
    date: payload.date || new Date().toISOString().split('T')[0],
    jobDescription: payload.jobDescription || '',
    shootDate: payload.shootDate || '',
    location: payload.location || client.location || '',
    body: payload.body || '',
    clientSignature: '',
    clientSignedAt: '',
    documentNumber,
  }

  const docName = payload.docName || `Contract - ${client.name}`

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      name: docName,
      doc_type: 'contract',
      content: JSON.stringify({ template: 'Contract', form }),
      client_id: client.id,
    })
    .select('id')
    .single()
  if (error || !doc) fail(`could not save document: ${error?.message}`)

  await supabase.from('activities').insert({
    action: 'document_created',
    details: `Contract "${docName}" created for ${client.name}`,
    client_id: client.id,
  })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const portalUrl = appUrl ? `${appUrl}/portal/client/${portalToken}` : `/portal/client/${portalToken}`
  const dashboardUrl = appUrl ? `${appUrl}/dashboard/documents/${doc.id}` : `/dashboard/documents/${doc.id}`

  console.log(JSON.stringify({
    documentId: doc.id,
    documentNumber,
    clientId: client.id,
    clientName: client.name,
    portalUrl,
    dashboardUrl,
  }, null, 2))
}

main().catch((err) => fail(err.stack || String(err)))
