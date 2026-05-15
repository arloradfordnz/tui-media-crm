import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const fd = await request.formData()
  const docId = fd.get('docId') as string
  const name = fd.get('name') as string
  const docType = fd.get('docType') as string
  const content = fd.get('content') as string
  const clientId = fd.get('clientId') as string

  if (!docId || !name) return Response.json({ error: 'Missing fields.' }, { status: 400 })

  const supabase = await createServerSupabaseClient()

  // Preserve client-only fields the admin form does not surface — feedback
  // history and the digital signature. Without this, an admin save after the
  // client has signed would silently wipe the signature, leaving the
  // signed-state UI broken on the portal.
  let mergedContent = content || ''
  try {
    const incoming = content ? JSON.parse(content) : null
    if (incoming && typeof incoming === 'object') {
      const { data: existing } = await supabase
        .from('documents')
        .select('content')
        .eq('id', docId)
        .single()
      if (existing?.content) {
        const prior = JSON.parse(existing.content) as {
          feedback?: unknown
          form?: Record<string, unknown>
        }
        const merged = { ...incoming } as {
          feedback?: unknown
          form?: Record<string, unknown>
        }
        if (Array.isArray(prior?.feedback)) merged.feedback = prior.feedback
        const priorSig = prior?.form?.clientSignature
        const priorSignedAt = prior?.form?.clientSignedAt
        if (priorSig) {
          merged.form = {
            ...(merged.form ?? {}),
            clientSignature: priorSig,
            clientSignedAt: priorSignedAt,
          }
        }
        mergedContent = JSON.stringify(merged)
      }
    }
  } catch { /* keep original content */ }

  const { error } = await supabase
    .from('documents')
    .update({ name, doc_type: docType || 'contract', content: mergedContent, client_id: clientId || null })
    .eq('id', docId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
