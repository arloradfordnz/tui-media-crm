import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'
import { lookupLegalEntity } from '@/lib/legal-lookup'

// The contract popup's legal-name question asks this while Arlo answers the
// questions before it, then shows what the Companies Register says as options
// to confirm. See lib/legal-lookup.ts.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: client } = await supabase
    .from('clients')
    .select('name, contact_person, location')
    .eq('id', id)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'No such client.' }, { status: 404 })
  return NextResponse.json(await lookupLegalEntity(client))
}
