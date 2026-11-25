import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { getClientSession } from '@/lib/client-auth'
import { getVerifiedUser } from '@/lib/supabase'
import { loadPortalData, type PortalClient } from '@/lib/portal-data'
import ClientPortalView from '../client/[token]/ClientPortalView'
import PortalSignOut from './PortalSignOut'
import type { Metadata } from 'next'
import Link from 'next/link'
import { cache } from 'react'
import { KeyRound } from 'lucide-react'
import { brandTitle, normalizeBrand } from '@/lib/brand'

// generateMetadata and the page both need the client row; cache() makes it
// one lookup per request (AGENTS.md).
const signedInClient = cache(async () => {
  const session = await getClientSession()
  if (!session) return { session: null, client: null }
  const admin = createAdminClient()
  if (!admin) return { session, client: null }
  const { data: client } = await admin
    .from('clients')
    .select('id, name, contact_person, portal_token, brand')
    .eq('id', session.clientId)
    .single()
  return { session, client: client ?? null }
})

export async function generateMetadata(): Promise<Metadata> {
  const { client } = await signedInClient()
  return { title: brandTitle('Your projects', (client?.brand as string | null) ?? null) }
}

/**
 * The portal for a signed-in client.
 *
 * Same view as the emailed token link, but the client is established from the
 * session instead: getClientSession() verifies the user against the auth
 * server and then reads client_users for the one client_id they may see. The
 * id never comes from the URL, so there is no id here to tamper with.
 */
export default async function PortalMePage() {
  const { session, client } = await signedInClient()
  if (!session) {
    // Plain /portal/login would bounce a signed-in user straight back here
    // (proxy.ts sends them to their front door), so say why instead.
    const user = await getVerifiedUser()
    if (!user) redirect('/portal/login')
    if (user.app_metadata?.role === 'admin') redirect('/dashboard')
    if (user.app_metadata?.role === 'marketer') redirect('/marketing')
    redirect('/portal/login?error=account')
  }

  if (!createAdminClient()) redirect('/portal/login')
  if (!client) redirect('/portal/login?error=account')

  const portalData = await loadPortalData(client as unknown as PortalClient)
  if (!portalData) redirect('/portal/login?error=account')

  // Arlo Radford: the account links sit in the site-style header.
  if (normalizeBrand(client.brand as string | null) === 'arlo_radford') {
    return (
      <ClientPortalView
        data={portalData}
        headerActions={<>
          <Link href="/portal/setup">Change password</Link>
          <PortalSignOut plain />
        </>}
      />
    )
  }

  return (
    <>
      <div className="flex justify-end gap-2 px-6 pt-4">
        <Link href="/portal/setup" className="btn-ghost btn-sm">
          <KeyRound className="w-3.5 h-3.5" />
          Change password
        </Link>
        <PortalSignOut />
      </div>
      <ClientPortalView data={portalData} />
    </>
  )
}
