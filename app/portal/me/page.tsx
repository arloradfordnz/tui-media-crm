import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase-admin'
import { getClientSession } from '@/lib/client-auth'
import { getVerifiedUser } from '@/lib/supabase'
import { loadPortalData, type PortalClient } from '@/lib/portal-data'
import ClientPortalView from '../client/[token]/ClientPortalView'
import PortalSignOut from './PortalSignOut'
import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'

export const metadata: Metadata = { title: 'Your projects — Tui Media' }

/**
 * The portal for a signed-in client.
 *
 * Same view as the emailed token link, but the client is established from the
 * session instead: getClientSession() verifies the user against the auth
 * server and then reads client_users for the one client_id they may see. The
 * id never comes from the URL, so there is no id here to tamper with.
 */
export default async function PortalMePage() {
  const session = await getClientSession()
  if (!session) {
    // Plain /portal/login would bounce a signed-in user straight back here
    // (proxy.ts sends them to their front door), so say why instead.
    const user = await getVerifiedUser()
    if (!user) redirect('/portal/login')
    if (user.app_metadata?.role === 'admin') redirect('/dashboard')
    redirect('/portal/login?error=account')
  }

  const admin = createAdminClient()
  if (!admin) redirect('/portal/login')

  const { data: client } = await admin
    .from('clients')
    .select('id, name, contact_person, portal_token')
    .eq('id', session.clientId)
    .single()

  if (!client) redirect('/portal/login?error=account')

  const portalData = await loadPortalData(client as unknown as PortalClient)
  if (!portalData) redirect('/portal/login?error=account')

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
