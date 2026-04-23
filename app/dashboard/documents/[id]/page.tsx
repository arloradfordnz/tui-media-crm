import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import DocumentEditor from './DocumentEditor'

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const [{ data: doc }, { data: clients }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).single(),
    supabase.from('clients').select('id, name, contact_person, email, phone, location, portal_token').order('name', { ascending: true }),
  ])

  if (!doc) notFound()

  return (
    <DocumentEditor
      doc={{ id: doc.id, name: doc.name, docType: doc.doc_type, content: doc.content, clientId: doc.client_id ?? null }}
      clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name, contactPerson: c.contact_person, email: c.email, phone: c.phone, location: c.location, portalToken: c.portal_token ?? null }))}
    />
  )
}
