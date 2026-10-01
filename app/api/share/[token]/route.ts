import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { signedDownloadUrlAttachment } from '@/lib/r2'

// The download link emailed to a client's marketing person when a cut is
// approved. Public: the share_token is the auth, and it opens that one file
// and nothing else — not the portal, not the other deliveries.
//
// Presigned R2 URLs expire after seven days, so the email can't carry one.
// This mints a fresh one on every click and redirects to it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function gone(message: string, status = 404) {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tui Media</title></head>` +
    `<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060D1A;color:#EFF2F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;text-align:center;">` +
    `<div><p style="font-size:18px;font-weight:600;margin:0 0 8px;">${message}</p>` +
    `<p style="color:#8996B2;font-size:14px;margin:0;">Email <a href="mailto:hello@tuimedia.nz" style="color:#EFF2F8;">hello@tuimedia.nz</a> and we'll send it again.</p></div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!UUID.test(token)) return gone('This link isn’t valid.')

  const admin = createAdminClient()
  if (!admin) return gone('Downloads are unavailable right now.', 503)

  const { data: file } = await admin
    .from('delivery_files')
    .select('file_name, file_url, original_name, archived_at')
    .eq('share_token', token)
    .single()

  if (!file) return gone('This link isn’t valid.')
  if (file.archived_at) return gone('This video has been archived.', 410)

  // Legacy rows hold an external URL (e.g. Vimeo) instead of an R2 key.
  if (file.file_url && /^https?:\/\//.test(file.file_url)) return Response.redirect(file.file_url, 302)
  if (!file.file_name) return gone('This link isn’t valid.')

  const url = await signedDownloadUrlAttachment(file.file_name, file.original_name || undefined, 60 * 60)
  return Response.redirect(url, 302)
}
