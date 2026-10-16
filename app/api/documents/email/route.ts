import { NextRequest } from 'next/server'
import { sendDocumentToClientEmail } from '@/lib/email'
import { createAdminClient, getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const { to, clientName, docName, template, clientId, portalToken, docId } = await request.json()
  if (!to) return Response.json({ error: 'Missing recipient.' }, { status: 400 })
  if (!portalToken) return Response.json({ error: 'Client has no portal link yet — open the client record and generate one.' }, { status: 400 })

  try {
    await sendDocumentToClientEmail({
      to,
      clientName: clientName || 'there',
      docName: docName || template || 'Document',
      template: template || 'Document',
      clientId,
      portalToken,
    })
    // When it went out, for the "Sent" step on the document page and for the
    // two-day follow-up (app/api/portal-reminders). The first send is kept,
    // so re-sending does not push the follow-up back.
    if (typeof docId === 'string' && docId) {
      const admin = createAdminClient()
      await admin?.from('documents').update({ sent_at: new Date().toISOString() }).eq('id', docId).is('sent_at', null)
    }
    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email.'
    return Response.json({ error: message }, { status: 500 })
  }
}
