import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { jobId, revisionLimit } = await request.json()

  if (!jobId || revisionLimit === undefined) {
    return Response.json({ error: 'Job ID and revision limit are required.' }, { status: 400 })
  }

  const { error } = await supabase.from('jobs').update({ revision_limit: revisionLimit }).eq('id', jobId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
