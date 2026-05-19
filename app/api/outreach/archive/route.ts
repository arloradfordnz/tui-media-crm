import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  const { id, unarchive } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('activities')
    .update({ action: unarchive ? 'outreach_draft' : 'outreach_archived' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
