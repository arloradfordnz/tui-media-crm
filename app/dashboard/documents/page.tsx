import { createServerSupabaseClient } from '@/lib/supabase'
import PdfGenerator from './PdfGenerator'
import NewDocButton from './NewDocButton'

// The Saved Templates grid is gone. It listed every document ever generated as
// a card grid under the generator, which grew without limit and was not what
// anyone came to this page for — you come here to make a document. Saved
// documents are still reachable at /dashboard/documents/[id]; nothing was
// deleted, only the wall of cards.
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, contact_person, email, phone, location, portal_token')
    .order('name', { ascending: true })

  const clientOptions = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    contactPerson: c.contact_person,
    email: c.email,
    phone: c.phone,
    location: c.location,
    portalToken: c.portal_token ?? null,
  }))

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">Generate a contract, quote or call sheet as a PDF.</p>
        </div>
        <div className="page-header-actions">
          <NewDocButton clients={clientOptions.map((c) => ({ id: c.id, name: c.name }))} defaultClientId={params.clientId} />
        </div>
      </div>

      <PdfGenerator clients={clientOptions} initialClientId={params.clientId} />
    </div>
  )
}
