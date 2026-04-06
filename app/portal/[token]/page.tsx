import { createServerSupabaseClient } from '@/lib/supabase'
import PortalView from './PortalView'

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, name, status, revision_limit, revisions_used, portal_token, client_id, clients(name), deliverables(id, title, description, completed, delivery_files(id, file_name, original_name, file_url, version_label, delivery_status, viewed_at, approved_at, download_enabled, personal_note, created_at)), revisions(id, round, request, status, created_at)')
    .eq('portal_token', token)
    .single()

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Link not found</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>This portal link is invalid or has expired.</p>
      </div>
    )
  }

  const client = job.clients as unknown as { name: string }

  const jobData = {
    id: job.id,
    name: job.name,
    status: job.status,
    revisionLimit: job.revision_limit,
    revisionsUsed: job.revisions_used,
    portalToken: job.portal_token,
    client: { name: client.name },
    deliverables: ((job.deliverables as unknown as {
      id: string; title: string; description: string | null; completed: boolean;
      delivery_files: { id: string; file_name: string; original_name: string; file_url: string | null; version_label: string; delivery_status: string; viewed_at: string | null; approved_at: string | null; download_enabled: boolean; personal_note: string | null; created_at: string }[]
    }[]) ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      completed: d.completed,
      deliveryFiles: (d.delivery_files ?? []).map((f) => ({
        id: f.id,
        fileName: f.file_name,
        originalName: f.original_name,
        fileUrl: f.file_url,
        versionLabel: f.version_label,
        deliveryStatus: f.delivery_status,
        viewedAt: f.viewed_at,
        approvedAt: f.approved_at,
        downloadEnabled: f.download_enabled,
        personalNote: f.personal_note,
        createdAt: f.created_at,
      })),
    })),
    revisions: ((job.revisions as unknown as { id: string; round: number; request: string; status: string; created_at: string }[]) ?? []).map((r) => ({
      id: r.id,
      round: r.round,
      request: r.request,
      status: r.status,
      createdAt: r.created_at,
    })),
  }

  return <PortalView job={jobData} />
}
