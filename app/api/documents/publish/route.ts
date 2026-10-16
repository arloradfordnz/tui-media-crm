import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'

// Makes a document visible in the client's portal without emailing them, for a
// client with no email on file or a document Arlo will mention himself.
// Emailing it from the document page does the same thing and tells them.
export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const { docId } = await request.json().catch(() => ({})) as { docId?: string }
  if (!docId) return Response.json({ error: 'Missing document.' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: doc } = await supabase.from('documents').select('id, client_id, sent_at').eq('id', docId).single()
  if (!doc) return Response.json({ error: 'Document not found.' }, { status: 404 })
  if (!doc.client_id) return Response.json({ error: 'Pick a client first, so there is a portal to put it in.' }, { status: 400 })
  if (doc.sent_at) return Response.json({ ok: true, sentAt: doc.sent_at })

  const sentAt = new Date().toISOString()
  const { error } = await supabase.from('documents').update({ sent_at: sentAt }).eq('id', docId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, sentAt })
}
