'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'

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

  // Preserve client-side feedback (and any other fields outside template/form) from being overwritten by the editor save
  let mergedContent = content || ''
  try {
    const incoming = content ? JSON.parse(content) : null
    if (incoming && typeof incoming === 'object') {
      const { data: existing } = await supabase.from('documents').select('content').eq('id', docId).single()
      if (existing?.content) {
        const prior = JSON.parse(existing.content)
        if (prior && typeof prior === 'object' && Array.isArray((prior as { feedback?: unknown }).feedback)) {
          mergedContent = JSON.stringify({ ...incoming, feedback: (prior as { feedback: unknown[] }).feedback })
        }
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

  const supabase = await createServerSupabaseClient()

  // Authorise: the document's client must match the client the portal token belongs to.
  // Both reads are independent; run in parallel.
  const [docRes, clientRes] = await Promise.all([
    supabase.from('documents').select('id, content, client_id').eq('id', docId).single(),
    supabase.from('clients').select('id, name').eq('portal_token', portalToken).single(),
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
  const nextForm = { ...(parsed.form || {}), clientSignature: signature, clientSignedAt: signedAt }
  const nextContent = JSON.stringify({ ...parsed, form: nextForm })

  await Promise.all([
    supabase.from('documents').update({ content: nextContent, doc_type: 'contract' }).eq('id', docId),
    supabase.from('activities').insert({
      action: 'document_signed',
      details: `${client.name} signed "${signature}" on a document`,
      client_id: client.id,
    }),
    supabase.from('notifications').insert({
      title: 'Document Signed',
      message: `${client.name} signed a document (${signature})`,
      type: 'document_signed',
      client_id: client.id,
    }),
  ])

  revalidatePath('/portal/')
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

  const supabase = await createServerSupabaseClient()

  const [docRes, clientRes] = await Promise.all([
    supabase.from('documents').select('id, name, content, client_id').eq('id', docId).single(),
    supabase.from('clients').select('id, name').eq('portal_token', portalToken).single(),
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

  await Promise.all([
    supabase.from('documents').update({ content: nextContent }).eq('id', docId),
    supabase.from('activities').insert({
      action: 'document_feedback',
      details: `${client.name} left feedback on "${doc.name}"`,
      client_id: client.id,
    }),
    supabase.from('notifications').insert({
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
