import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchXeroContacts } from '@/lib/xero'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const search = req.nextUrl.searchParams.get('q') ?? undefined
  const contacts = await fetchXeroContacts(search)
  if (contacts === null) return NextResponse.json({ error: 'Xero not connected' }, { status: 503 })

  return NextResponse.json({ contacts })
}
