import { NextRequest } from 'next/server'
import { sendDocumentToClientEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const { to, clientName, docName, template, fileName, pdfBase64, clientId } = await request.json()
  if (!to || !pdfBase64) return Response.json({ error: 'Missing recipient or PDF.' }, { status: 400 })

  try {
    await sendDocumentToClientEmail({
      to,
      clientName: clientName || 'there',
      docName: docName || template || 'Document',
      template: template || 'Document',
      fileName: fileName || `${(docName || 'document').replace(/\s+/g, '_')}.pdf`,
      pdfBase64,
      clientId,
    })
    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email.'
    return Response.json({ error: message }, { status: 500 })
  }
}
