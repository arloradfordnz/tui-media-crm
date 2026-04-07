import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { fileId, status } = await request.json()

  if (!fileId || !status) {
    return Response.json({ error: 'File ID and status are required.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { delivery_status: status }
  if (status === 'viewed') updates.viewed_at = new Date().toISOString()
  if (status === 'approved') updates.approved_at = new Date().toISOString()

  const { error } = await supabase.from('delivery_files').update(updates).eq('id', fileId)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
