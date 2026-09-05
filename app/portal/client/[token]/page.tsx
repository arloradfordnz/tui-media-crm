import { createAdminClient } from '@/lib/supabase-admin'
import { signedDownloadUrl, signedDownloadUrlAttachment } from '@/lib/r2'
import ClientPortalView from './ClientPortalView'
import type { Metadata } from 'next'

// A shared portal link previews as "Tui Media" generically today — every
// client's link looks identical in a Slack/iMessage preview. This scopes the
// title to the client without leaking anything beyond their own name: an
// invalid token still falls back to the generic title rather than a lookup
// error, so a bad link reveals nothing about which tokens are real.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const supabase = createAdminClient()
  const fallback: Metadata = { title: 'Tui Media — Client Portal' }
  if (!supabase) return fallback

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('portal_token', token)
    .single()

  if (!client) return fallback
  return { title: `${client.name} — Tui Media` }
}

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Public page — the unguessable token in the URL IS the auth. RLS grants anon
  // nothing, so read with the service role, scoped strictly to this token's client.
  const supabase = createAdminClient()

  if (!supabase) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Portal unavailable</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Please try again later.</p>
      </div>
    )
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email, contact_person, portal_token')
    .eq('portal_token', token)
    .single()

  if (!client) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Link not found</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>This portal link is invalid or has expired.</p>
      </div>
    )
  }

  // Fetch jobs (with deliverables) and documents in parallel — they don't depend on each other.
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

  type RawDeliveryFile = { id: string; file_name: string; original_name: string; file_url: string | null; mime_type: string | null; version_label: string; delivery_status: string; download_enabled: boolean; personal_note: string | null; created_at: string }
  type RawRevision = { id: string; round: number; request: string; status: string; reply: string | null; created_at: string }
  type RawDeliverable = { id: string; title: string; description: string | null; completed: boolean; revision_limit: number | null; revisions_used: number | null; delivery_files: RawDeliveryFile[]; revisions: RawRevision[] | null }
  type RawJob = { id: string; name: string; status: string; job_type: string | null; shoot_date: string | null; deliverables: RawDeliverable[] }

  // Generate fresh presigned R2 URLs for every delivered file.
  // file_name holds the R2 object key; file_url may hold an externally-hosted URL (e.g. Vimeo) in legacy rows.
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

  const portalData = {
    client: { name: client.name, contactPerson: client.contact_person ?? null },
    portalToken: token,
    jobs: jobsResolved,
    documents: (documents ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      docType: d.doc_type,
      content: d.content,
      updatedAt: d.updated_at,
    })),
  }

  return <ClientPortalView data={portalData} />
}
