import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import DocumentEditor from './DocumentEditor'

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: doc } = await supabase.from('documents').select('*').eq('id', id).single()
  if (!doc) notFound()

  return <DocumentEditor doc={{ id: doc.id, name: doc.name, docType: doc.doc_type, content: doc.content }} />
}
