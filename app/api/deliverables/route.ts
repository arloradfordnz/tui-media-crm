import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { jobId, title } = await request.json()

  if (!jobId || !title) {
    return Response.json({ error: 'Job ID and title are required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('deliverables')
    .insert({ job_id: jobId, title, description: null })
    .select('id, title, description, completed')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ deliverable: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { id, title } = await request.json()

  if (!id || !title) {
    return Response.json({ error: 'ID and title are required.' }, { status: 400 })
  }

  const { error } = await supabase.from('deliverables').update({ title }).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { id } = await request.json()

  if (!id) {
    return Response.json({ error: 'ID is required.' }, { status: 400 })
  }

  const { error } = await supabase.from('deliverables').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
