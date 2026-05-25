import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createXeroInvoice, approveXeroInvoice, fetchOutstandingInvoices } from '@/lib/xero'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoices = await fetchOutstandingInvoices()
  return NextResponse.json({ invoices })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, ...rest } = body

  if (action === 'approve') {
    const { invoiceId } = rest as { invoiceId: string }
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
    const ok = await approveXeroInvoice(invoiceId)
    return NextResponse.json({ ok })
  }

  // Default: create invoice
  const invoice = await createXeroInvoice(rest)
  if (!invoice) return NextResponse.json({ error: 'Failed to create invoice in Xero' }, { status: 500 })

  return NextResponse.json({ invoice })
}
