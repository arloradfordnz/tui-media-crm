import { NextRequest } from 'next/server'
import { sendDocumentToClientEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const { to, clientName, docName, template, clientId, portalToken } = await request.json()
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
    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email.'
    return Response.json({ error: message }, { status: 500 })
  }
}
