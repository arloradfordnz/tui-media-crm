import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase-admin'
import { loadPortalData, type PortalClient } from '@/lib/portal-data'
import ClientPortalView from './ClientPortalView'
import type { Metadata } from 'next'

// generateMetadata and the page body both need this row, and Next runs them as
// part of the same request — so without cache() every portal visit looked the
// client up twice over the network to render one page. The select is the
// superset of what either caller wants; the title takes `name` out of it.
const clientByToken = cache(async (token: string) => {
  const supabase = createAdminClient()
  if (!supabase) return null
  const { data } = await supabase
    .from('clients')
    .select('id, name, email, contact_person, portal_token')
    .eq('portal_token', token)
    .single()
  return data ?? null
})

// A shared portal link previews as "Tui Media" generically today — every
// client's link looks identical in a Slack/iMessage preview. This scopes the
// title to the client without leaking anything beyond their own name: an
// invalid token still falls back to the generic title rather than a lookup
// error, so a bad link reveals nothing about which tokens are real.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const fallback: Metadata = { title: 'Tui Media — Client Portal' }
  const client = await clientByToken(token)
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

  const client = await clientByToken(token)

  if (!client) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Link not found</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>This portal link is invalid or has expired.</p>
      </div>
    )
  }

  const portalData = await loadPortalData(client as unknown as PortalClient)
  if (!portalData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Portal unavailable</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Please try again later.</p>
      </div>
    )
  }

  return <ClientPortalView data={portalData} />
}
