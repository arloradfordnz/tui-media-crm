'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'

export async function createDocument(prevState: { error?: string } | undefined, formData: FormData) {
  const name = formData.get('name') as string
  const docType = formData.get('docType') as string

  if (!name) return { error: 'Name is required.' }

  const doc = await db.document.create({
    data: { name, docType: docType || 'contract', content: '' },
  })

  revalidatePath('/dashboard/documents')
  redirect(`/dashboard/documents/${doc.id}`)
}

export async function updateDocument(prevState: { error?: string } | undefined, formData: FormData) {
  const docId = formData.get('docId') as string
  const name = formData.get('name') as string
  const docType = formData.get('docType') as string
  const content = formData.get('content') as string

  if (!name) return { error: 'Name is required.' }

  await db.document.update({
    where: { id: docId },
    data: { name, docType: docType || 'contract', content: content || '' },
  })

  revalidatePath('/dashboard/documents')
  revalidatePath(`/dashboard/documents/${docId}`)
  return {}
}

export async function deleteDocument(docId: string) {
  await db.document.delete({ where: { id: docId } })
  revalidatePath('/dashboard/documents')
  redirect('/dashboard/documents')
}
