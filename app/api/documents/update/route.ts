import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const fd = await request.formData()
  const docId = fd.get('docId') as string
  const name = fd.get('name') as string
  const docType = fd.get('docType') as string
  const content = fd.get('content') as string
  const clientId = fd.get('clientId') as string

  if (!docId || !name) return Response.json({ error: 'Missing fields.' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('documents')
    .update({ name, doc_type: docType || 'contract', content: content || '', client_id: clientId || null })
    .eq('id', docId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
