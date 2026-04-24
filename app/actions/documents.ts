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
  await supabase.from('documents').update({ name, doc_type: docType || 'contract', content: content || '', client_id: clientId || null }).eq('id', docId)

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

  // Authorise: the document's client must match the client the portal token belongs to
  const { data: doc } = await supabase
    .from('documents')
    .select('id, content, client_id')
    .eq('id', docId)
    .single()
  if (!doc) return { error: 'Document not found.' }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('portal_token', portalToken)
    .single()
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

  await supabase.from('documents').update({ content: nextContent, doc_type: 'contract' }).eq('id', docId)
  await supabase.from('activities').insert({
    action: 'document_signed',
    details: `${client.name} signed "${signature}" on a document`,
    client_id: client.id,
  })
  await supabase.from('notifications').insert({
    title: 'Document Signed',
    message: `${client.name} signed a document (${signature})`,
    type: 'document_signed',
    client_id: client.id,
  })

  revalidatePath('/portal/')
  return { success: true }
}
