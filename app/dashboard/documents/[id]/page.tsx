import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import DocumentEditor from './DocumentEditor'

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const [{ data: doc }, { data: clients }] = await Promise.all([
    supabase.from('documents').select('id, name, doc_type, content, client_id, created_at, sent_at, viewed_at, last_viewed_at, view_count').eq('id', id).single(),
    supabase.from('clients').select('id, name, contact_person, email, phone, location, portal_token').order('name', { ascending: true }),
  ])

  if (!doc) notFound()

  return (
    <DocumentEditor
      doc={{ id: doc.id, name: doc.name, docType: doc.doc_type, content: doc.content, clientId: doc.client_id ?? null, createdAt: doc.created_at, sentAt: doc.sent_at ?? null, viewedAt: doc.viewed_at ?? null, lastViewedAt: doc.last_viewed_at ?? null, viewCount: doc.view_count ?? 0 }}
      clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name, contactPerson: c.contact_person, email: c.email, phone: c.phone, location: c.location, portalToken: c.portal_token ?? null }))}
    />
  )
}
