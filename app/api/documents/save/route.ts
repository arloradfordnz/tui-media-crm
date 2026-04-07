import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { name, docType, content } = await request.json()

  if (!name) {
    return Response.json({ error: 'Name is required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({ name, doc_type: docType || 'general', content: content || '' })
    .select('id')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ id: data.id })
}
