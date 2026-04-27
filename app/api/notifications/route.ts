import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

type Row = { id: string; title: string; message: string; type: string; read: boolean; created_at: string; link_url: string | null }

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('notifications')
    .select('id, title, message, type, read, created_at, link_url')
    .order('created_at', { ascending: false })
    .limit(50)

  const notifications = ((data as Row[] | null) ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    createdAt: n.created_at,
    linkUrl: n.link_url,
  }))
  return NextResponse.json(notifications)
}
