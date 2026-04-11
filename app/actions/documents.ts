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
