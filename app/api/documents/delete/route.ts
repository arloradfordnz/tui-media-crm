import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const fd = await request.formData()
  const docId = fd.get('docId') as string
  if (!docId) return Response.json({ error: 'Missing docId.' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('documents').delete().eq('id', docId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
