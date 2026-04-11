import { createServerSupabaseClient } from '@/lib/supabase'
import ClientPortalView from './ClientPortalView'

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email, portal_token')
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

  // Fetch active jobs with deliverables
  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      id, name, status, job_type, shoot_date,
      deliverables(
        id, title, description, completed,
        delivery_files(id, file_name, original_name, file_url, version_label, delivery_status, download_enabled, personal_note, created_at)
      )
    `)
    .eq('client_id', client.id)
    .not('status', 'in', '("archived")')
    .order('created_at', { ascending: false })

  // Fetch documents linked to this client
  const { data: documents } = await supabase
    .from('documents')
    .select('id, name, doc_type, content, updated_at')
    .eq('client_id', client.id)
    .order('updated_at', { ascending: false })

  type RawDeliverable = {
    id: string; title: string; description: string | null; completed: boolean;
    delivery_files: { id: string; file_name: string; original_name: string; file_url: string | null; version_label: string; delivery_status: string; download_enabled: boolean; personal_note: string | null; created_at: string }[]
  }

  const portalData = {
    client: { name: client.name },
    jobs: (jobs ?? []).map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      jobType: j.job_type,
      shootDate: j.shoot_date,
      deliverables: ((j.deliverables as unknown as RawDeliverable[]) ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        completed: d.completed,
        deliveryFiles: (d.delivery_files ?? []).map((f) => ({
          id: f.id,
          originalName: f.original_name,
          fileUrl: f.file_url,
          versionLabel: f.version_label,
          deliveryStatus: f.delivery_status,
          downloadEnabled: f.download_enabled,
          personalNote: f.personal_note,
          createdAt: f.created_at,
        })),
      })),
    })),
    documents: (documents ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      docType: d.doc_type,
      updatedAt: d.updated_at,
    })),
  }

  return <ClientPortalView data={portalData} />
}
