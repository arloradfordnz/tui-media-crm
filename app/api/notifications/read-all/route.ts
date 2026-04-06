import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  await supabase.from('notifications').update({ read: true }).eq('read', false)
  return NextResponse.json({ ok: true })
}
