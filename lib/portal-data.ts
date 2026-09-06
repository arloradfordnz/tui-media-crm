import { createAdminClient } from '@/lib/supabase-admin'
import { signedDownloadUrl, signedDownloadUrlAttachment } from '@/lib/r2'

/**
 * Everything a client may see, for one client.
 *
 * Shared by both ways into the portal: the emailed token link
 * (/portal/client/[token]) and a signed-in account (/portal/me). Whoever
 * calls this has already established which client they are — by matching the
 * token, or by resolving client_users from a verified session — and this
 * function is scoped to that one client_id and nothing else.
 */

type RawDeliveryFile = { id: string; file_name: string; original_name: string; file_url: string | null; mime_type: string | null; version_label: string; delivery_status: string; download_enabled: boolean; personal_note: string | null; created_at: string }
type RawRevision = { id: string; round: number; request: string; status: string; reply: string | null; created_at: string }
type RawDeliverable = { id: string; title: string; description: string | null; completed: boolean; revision_limit: number | null; revisions_used: number | null; delivery_files: RawDeliveryFile[]; revisions: RawRevision[] | null }
type RawJob = { id: string; name: string; status: string; job_type: string | null; shoot_date: string | null; deliverables: RawDeliverable[] }

export type PortalClient = { id: string; name: string; contact_person: string | null; portal_token: string | null }

export async function loadPortalData(client: PortalClient) {
  const supabase = createAdminClient()
  if (!supabase) return null

  // Jobs (with deliverables) and documents don't depend on each other.
  const [{ data: jobs }, { data: documents }] = await Promise.all([
    supabase
      .from('jobs')
      .select(`
        id, name, status, job_type, shoot_date,
        deliverables(
          id, title, description, completed, revision_limit, revisions_used,
          delivery_files(id, file_name, original_name, file_url, mime_type, version_label, delivery_status, download_enabled, personal_note, created_at),
          revisions(*)
        )
      `)
      .eq('client_id', client.id)
      .not('status', 'in', '("archived")')
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('id, name, doc_type, content, updated_at')
      .eq('client_id', client.id)
      .order('updated_at', { ascending: false }),
  ])

  // Fresh presigned R2 URLs for every delivered file. file_name holds the R2
  // object key; file_url may hold an externally-hosted URL (e.g. Vimeo) in
  // legacy rows.
  const resolveFileUrl = async (key: string | null, legacyUrl: string | null): Promise<string | null> => {
    if (legacyUrl && /^https?:\/\//.test(legacyUrl)) return legacyUrl
    if (!key) return null
    try { return await signedDownloadUrl(key) } catch { return null }
  }
  // Force-download URL — used by the Download button so mobile browsers save
  // the file rather than opening it inline (the HTML `download` attribute is
  // ignored on cross-origin links).
  const resolveDownloadUrl = async (key: string | null, legacyUrl: string | null, originalName: string): Promise<string | null> => {
    if (legacyUrl && /^https?:\/\//.test(legacyUrl)) return legacyUrl
    if (!key) return null
    try { return await signedDownloadUrlAttachment(key, originalName) } catch { return null }
  }

  const jobsResolved = await Promise.all(
    ((jobs as unknown as RawJob[]) ?? []).map(async (j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      jobType: j.job_type,
      shootDate: j.shoot_date,
      deliverables: await Promise.all((j.deliverables ?? []).map(async (d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        completed: d.completed,
        revisionLimit: d.revision_limit ?? 2,
        revisionsUsed: d.revisions_used ?? 0,
        revisions: (d.revisions ?? []).map((r) => ({
          id: r.id,
          round: r.round,
          request: r.request,
          status: r.status,
          reply: r.reply ?? null,
          createdAt: r.created_at,
        })),
        deliveryFiles: await Promise.all((d.delivery_files ?? [])
          .filter((f) => f.delivery_status !== 'uploading')
          .map(async (f) => ({
            id: f.id,
            originalName: f.original_name,
            fileUrl: await resolveFileUrl(f.file_name, f.file_url),
            downloadUrl: await resolveDownloadUrl(f.file_name, f.file_url, f.original_name),
            mimeType: f.mime_type,
            versionLabel: f.version_label,
            deliveryStatus: f.delivery_status,
            downloadEnabled: f.download_enabled,
            personalNote: f.personal_note,
            createdAt: f.created_at,
          }))),
      }))),
    }))
  )

  return {
    client: { name: client.name, contactPerson: client.contact_person ?? null },
    // The portal's server actions still authorise by token. A signed-in client
    // gets their own token passed as a prop rather than carried in the URL.
    portalToken: client.portal_token ?? '',
    jobs: jobsResolved,
    documents: (documents ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      docType: d.doc_type,
      content: d.content,
      updatedAt: d.updated_at,
    })),
  }
}
