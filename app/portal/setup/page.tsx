import { redirect } from 'next/navigation'
import { getVerifiedUser } from '@/lib/supabase'
import PortalAuthShell from '../PortalAuthShell'
import SetPasswordForm from './SetPasswordForm'

export const metadata = { title: 'Set your password — Tui Media' }

/**
 * Where the setup and reset emails land, and where a signed-in client changes
 * their password.
 *
 * Opening this page does NOT spend the emailed token — the form carries it and
 * setPortalPassword() spends it on submit. Mail scanners open every link in an
 * email; a page that verified on load would be dead by the time the client
 * clicked it.
 */
export default async function PortalSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; k?: string }>
}) {
  const { token, k } = await searchParams

  if (token) {
    const reset = k === 'reset'
    return (
      <PortalAuthShell
        title={reset ? 'Choose a new password' : 'Choose a password'}
        intro={
          reset
            ? 'Pick a new password for your Tui Media portal.'
            : 'Pick a password for your Tui Media portal. You’ll sign in with it and the email address this link was sent to.'
        }
      >
        <SetPasswordForm token={token} />
      </PortalAuthShell>
    )
  }

  // No token: a signed-in client changing their password.
  const user = await getVerifiedUser()
  if (!user || user.app_metadata?.role !== 'client') redirect('/portal/login')

  return (
    <PortalAuthShell title="Change your password" intro={`For ${user.email}.`}>
      <SetPasswordForm email={user.email} />
    </PortalAuthShell>
  )
}
