import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteObject } from '@/lib/r2'

// delivery_files rows cascade away when their deliverable, job or client is
// deleted, but the R2 objects they point at do not — they would sit in the
// bucket forever, unreachable and still billed. Collect the keys BEFORE the
// delete (afterwards nothing says which objects were ours), then remove the
// objects once the delete has actually succeeded.

type Scope = { deliverableId: string } | { jobId: string } | { clientId: string }
type KeyRow = { file_name: string | null }
type DeliverableRow = { delivery_files: KeyRow[] | null }

export async function deliveryKeysFor(supabase: SupabaseClient, scope: Scope): Promise<string[]> {
  let rows: KeyRow[] = []
  if ('deliverableId' in scope) {
    const { data } = await supabase.from('delivery_files').select('file_name').eq('deliverable_id', scope.deliverableId)
    rows = (data as KeyRow[] | null) ?? []
  } else if ('jobId' in scope) {
    const { data } = await supabase.from('deliverables').select('delivery_files(file_name)').eq('job_id', scope.jobId)
    rows = ((data as DeliverableRow[] | null) ?? []).flatMap((d) => d.delivery_files ?? [])
  } else {
    const { data } = await supabase.from('jobs').select('deliverables(delivery_files(file_name))').eq('client_id', scope.clientId)
    rows = ((data as { deliverables: DeliverableRow[] | null }[] | null) ?? [])
      .flatMap((j) => j.deliverables ?? [])
      .flatMap((d) => d.delivery_files ?? [])
  }
  // Legacy rows hold a URL (Vimeo etc.) rather than an R2 key — not ours to delete.
  return rows.map((r) => r.file_name).filter((k): k is string => !!k && !/^https?:\/\//.test(k))
}

// Best-effort: the database delete already happened, so a failure here must
// not surface as a failed delete. S3 deletes are idempotent; a leftover object
// is logged so it can be found.
export async function deleteDeliveryObjects(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      deleteObject(key).catch((e) => console.error('[r2-cleanup] failed to delete object', key, e)),
    ),
  )
}
