import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const deliverableId = formData.get('deliverableId') as string
  const versionLabel = formData.get('versionLabel') as string
  const notes = formData.get('notes') as string

  if (!file || !deliverableId) {
    return Response.json({ error: 'File and deliverable ID are required.' }, { status: 400 })
  }

  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${deliverableId}/${timestamp}_${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('deliverables')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from('deliverables')
    .getPublicUrl(storagePath)

  const { data: record, error: dbError } = await supabase.from('delivery_files').insert({
    deliverable_id: deliverableId,
    file_name: storagePath,
    original_name: file.name,
    file_url: urlData.publicUrl,
    size: file.size,
    mime_type: file.type,
    version_label: versionLabel || 'first_cut',
    personal_note: notes || null,
    delivery_status: 'not_sent',
  }).select('id, original_name, version_label, delivery_status, created_at, file_url, personal_note').single()

  if (dbError) {
    return Response.json({ error: dbError.message }, { status: 500 })
  }

  return Response.json({ file: record })
}
