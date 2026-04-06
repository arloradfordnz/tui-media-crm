import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email')
    .order('name', { ascending: true })
  return NextResponse.json(clients ?? [])
}
