import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedUser } from '@/lib/supabase'
import { getClientSession } from '@/lib/client-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { brandIdentity, brandTitle } from '@/lib/brand'
import PortalAuthShell from '../PortalAuthShell'
import SetPasswordForm from './SetPasswordForm'

type Search = Promise<{ token?: string; k?: string; brand?: string }>

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { brand } = await searchParams
  return { title: brandTitle('Set your password', brand) }
}

/**
 * Where the setup and reset emails land, and where a signed-in client changes
 * their password.
 *
 * Opening this page does NOT spend the emailed token — the form carries it and
 * setPortalPassword() spends it on submit. Mail scanners open every link in an
 * email; a page that verified on load would be dead by the time the client
 * clicked it.
 *
 * The brand comes from the emailed link (`?brand=`), since nobody is signed in
 * yet; a signed-in client's comes from their client record.
 */
export default async function PortalSetupPage({ searchParams }: { searchParams: Search }) {
  const { token, k, brand } = await searchParams

  if (token) {
    const reset = k === 'reset'
    const name = brandIdentity(brand).displayName
    return (
      <PortalAuthShell
        title={reset ? 'Choose a new password' : 'Choose a password'}
        intro={
          reset
            ? `Pick a new password for your ${name} portal.`
            : `Pick a password for your ${name} portal. You’ll sign in with it and the email address this link was sent to.`
        }
        brand={brand}
      >
        <SetPasswordForm token={token} first={!reset} />
      </PortalAuthShell>
    )
  }

  // No token: a signed-in client changing their password.
  const user = await getVerifiedUser()
  const role = user?.app_metadata?.role
  if (!user || (role !== 'client' && role !== 'marketer')) redirect('/portal/login')

  let clientBrand: string | null = null
  if (role === 'client') {
    const session = await getClientSession()
    const admin = session ? createAdminClient() : null
    if (session && admin) {
      const { data } = await admin.from('clients').select('brand').eq('id', session.clientId).maybeSingle()
      clientBrand = (data?.brand as string | null) ?? null
    }
  }

  return (
    <PortalAuthShell title="Change your password" intro={`For ${user.email}.`} brand={clientBrand}>
      <SetPasswordForm email={user.email} />
    </PortalAuthShell>
  )
}
