import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'

export async function GET() {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const supabase = await createServerSupabaseClient()
  const { data: clients } = await supabase
    .from('clients')
    // The New Job wizard pre-fills the retainer and campaign steps from what
    // the client record already knows, so the type-specific step is mostly a
    // confirmation rather than re-entry.
    .select('id, name, email, monthly_retainer, videos_per_month, shoots_per_month, ad_spend_budget, customer_value')
    .eq('status', 'active')
    .order('name', { ascending: true })
  return NextResponse.json(clients ?? [])
}
