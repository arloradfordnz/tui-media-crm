import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'

export async function POST() {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const supabase = await createServerSupabaseClient()
  await supabase.from('notifications').update({ read: true }).eq('read', false)
  return NextResponse.json({ ok: true })
}
