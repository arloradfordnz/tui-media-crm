import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('business_info').select('section, content').order('section')
  return Response.json({ sections: data ?? [] })
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { section, content } = await request.json()

  if (!section) {
    return Response.json({ error: 'Section is required.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('business_info')
    .upsert({ section, content: content || '' }, { onConflict: 'section' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
