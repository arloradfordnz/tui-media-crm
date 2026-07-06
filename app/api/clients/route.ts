import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'

export async function GET() {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const supabase = await createServerSupabaseClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('status', 'active')
    .order('name', { ascending: true })
  return NextResponse.json(clients ?? [])
}
