'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendAdminDocumentSignedEmail } from '@/lib/email'
import { headers } from 'next/headers'

// Service-role client bypasses RLS. The portal/client table is anon-readable
// but anon cannot UPDATE documents/INSERT activities — we authorise the
// request ourselves via the portal_token match.
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key)
}

export async function createDocument(prevState: { error?: string } | undefined, formData: FormData) {
  const name = formData.get('name') as string
  const docType = formData.get('docType') as string
  const clientId = formData.get('clientId') as string

  if (!name) return { error: 'Name is required.' }

  const supabase = await createServerSupabaseClient()
  const { data: doc, error } = await supabase
    .from('documents')
    .insert({ name, doc_type: docType || 'contract', content: '', client_id: clientId || null })
    .select('id')
    .single()

  if (error || !doc) return { error: error?.message || 'Failed to create document.' }

  revalidatePath('/dashboard/documents')
  redirect(`/dashboard/documents/${doc.id}`)
}

export async function updateDocument(prevState: { error?: string } | undefined, formData: FormData) {
  const docId = formData.get('docId') as string
  const name = formData.get('name') as string
  const docType = formData.get('docType') as string
  const content = formData.get('content') as string
  const clientId = formData.get('clientId') as string

  if (!name) return { error: 'Name is required.' }

  const supabase = await createServerSupabaseClient()

  // Preserve client-only fields (feedback array, signature) — the editor form
  // doesn't track these, so a save would otherwise wipe them.
  let mergedContent = content || ''
  try {
    const incoming = content ? JSON.parse(content) : null
    if (incoming && typeof incoming === 'object') {
      const { data: existing } = await supabase.from('documents').select('content').eq('id', docId).single()
      if (existing?.content) {
        const prior = JSON.parse(existing.content) as { feedback?: unknown; form?: Record<string, unknown> }
        const merged = { ...incoming } as { feedback?: unknown; form?: Record<string, unknown> }
        if (Array.isArray(prior?.feedback)) merged.feedback = prior.feedback
        const priorForm = prior?.form as Record<string, unknown> | undefined
        if (priorForm?.clientSignature) {
          merged.form = {
            ...(merged.form ?? {}),
            clientSignature: priorForm.clientSignature,
            clientSignedAt: priorForm.clientSignedAt,
            clientSignedAtISO: priorForm.clientSignedAtISO,
          }
        }
        mergedContent = JSON.stringify(merged)
      }
    }
  } catch { /* keep original content */ }

  await supabase.from('documents').update({ name, doc_type: docType || 'contract', content: mergedContent, client_id: clientId || null }).eq('id', docId)

  revalidatePath('/dashboard/documents')
  revalidatePath(`/dashboard/documents/${docId}`)
  return {}
}

export async function deleteDocument(docId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('documents').delete().eq('id', docId)
  revalidatePath('/dashboard/documents')
  redirect('/dashboard/documents')
}

export async function signDocumentByClient(
  prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const docId = formData.get('docId') as string
  const portalToken = formData.get('portalToken') as string
  const signature = ((formData.get('signature') as string) || '').trim()

  if (!docId || !portalToken) return { error: 'Missing document or portal token.' }
  if (!signature) return { error: 'Please type your full name to sign.' }

  const admin = getAdminClient()
  if (!admin) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY — signature cannot be saved.' }

  // Authorise: the document's client must match the client the portal token belongs to.
  // Public page (no login) so read with the service role; both reads are independent.
  const [docRes, clientRes] = await Promise.all([
    admin.from('documents').select('id, name, content, client_id').eq('id', docId).single(),
    admin.from('clients').select('id, name, email').eq('portal_token', portalToken).single(),
  ])
  const doc = docRes.data
  const client = clientRes.data
  if (!doc) return { error: 'Document not found.' }
  if (!client || client.id !== doc.client_id) return { error: 'Not authorised to sign this document.' }

  // Parse existing content, merge signature into the form
  type DocContent = { template?: string; form?: Record<string, unknown> } & Record<string, unknown>
  let parsed: DocContent = {}
  try {
    parsed = doc.content ? (JSON.parse(doc.content) as DocContent) : {}
  } catch {
    parsed = {}
  }
  const signedAt = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  // Keep a machine-readable audit timestamp alongside the display date — the
  // pretty string has no time or timezone, which is weak for a signed contract.
  // Originating IP, for the audit trail. x-forwarded-for is a list when the
  // request crossed proxies; the first entry is the client. Best-effort — a
  // missing IP must not block someone signing.
  let signedIp: string | null = null
  try {
    const h = await headers()
    signedIp = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || null
  } catch {
    signedIp = null
  }

  const nextForm = {
    ...(parsed.form || {}),
    clientSignature: signature,
    clientSignedAt: signedAt,
    clientSignedAtISO: new Date().toISOString(),
    clientSignedIp: signedIp,
  }
  // Ensure a template is always present — the portal/editor parsers require
  // both `template` and `form` keys to recognise a structured doc, and a
  // missing template would otherwise hide the signed state.
  const nextTemplate = typeof parsed.template === 'string' && parsed.template
    ? parsed.template
    : 'Contract'
  const nextContent = JSON.stringify({ ...parsed, template: nextTemplate, form: nextForm })

  // Use the service-role client so the write isn't dropped by RLS.
  // Preserve the document's own type — only contracts reach the sign flow, but
  // forcing 'contract' here would silently retype anything else.
  const { error: updateError } = await admin
    .from('documents')
    .update({ content: nextContent })
    .eq('id', docId)
  if (updateError) return { error: 'Could not save signature. Please try again.' }

  await Promise.all([
    admin.from('activities').insert({
      action: 'document_signed',
      details: `${client.name} signed "${signature}" on ${doc.name}`,
      client_id: client.id,
    }),
    admin.from('notifications').insert({
      title: 'Document Signed',
      message: `${client.name} signed ${doc.name} (${signature})`,
      type: 'document_signed',
      client_id: client.id,
    }),
    sendAdminDocumentSignedEmail(client.name, doc.name, signature, signedAt, client.id).catch((e) => {
      console.error('Admin signed-email failed:', e)
    }),
  ])

  revalidatePath(`/portal/client/${portalToken}`)
  revalidatePath(`/dashboard/documents/${docId}`)
  revalidatePath('/dashboard/documents')
  return { success: true }
}

export async function submitDocumentFeedback(
  prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const docId = formData.get('docId') as string
  const portalToken = formData.get('portalToken') as string
  const message = ((formData.get('message') as string) || '').trim()

  if (!docId || !portalToken) return { error: 'Missing document or portal token.' }
  if (!message) return { error: 'Please type your feedback before sending.' }

  // Service role: the public portal has no login and anon has no UPDATE policy
  // on documents. Previously this ran as anon, so the write was silently
  // dropped by RLS and the client's feedback was lost.
  const admin = getAdminClient()
  if (!admin) return { error: 'Server misconfigured — feedback cannot be saved.' }

  const [docRes, clientRes] = await Promise.all([
    admin.from('documents').select('id, name, content, client_id').eq('id', docId).single(),
    admin.from('clients').select('id, name').eq('portal_token', portalToken).single(),
  ])
  const doc = docRes.data
  const client = clientRes.data
  if (!doc) return { error: 'Document not found.' }
  if (!client || client.id !== doc.client_id) return { error: 'Not authorised.' }

  type Feedback = { message: string; createdAt: string; author: string }
  type DocContent = { template?: string; form?: Record<string, unknown>; feedback?: Feedback[] } & Record<string, unknown>
  let parsed: DocContent = {}
  try {
    parsed = doc.content ? (JSON.parse(doc.content) as DocContent) : {}
  } catch {
    parsed = {}
  }

  const newEntry: Feedback = {
    message,
    createdAt: new Date().toISOString(),
    author: client.name,
  }
  const nextFeedback = [...(parsed.feedback ?? []), newEntry]
  const nextContent = JSON.stringify({ ...parsed, feedback: nextFeedback })

  const { error: updateError } = await admin.from('documents').update({ content: nextContent }).eq('id', docId)
  if (updateError) return { error: 'Could not save your feedback. Please try again.' }

  await Promise.all([
    admin.from('activities').insert({
      action: 'document_feedback',
      details: `${client.name} left feedback on "${doc.name}"`,
      client_id: client.id,
    }),
    admin.from('notifications').insert({
      title: 'Document Feedback',
      message: `${client.name} left feedback on "${doc.name}"`,
      type: 'document_feedback',
      client_id: client.id,
    }),
  ])

  revalidatePath('/portal/')
  revalidatePath(`/dashboard/documents/${docId}`)
  return { success: true }
}
