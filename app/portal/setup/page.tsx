import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import PortalAuthShell from '../PortalAuthShell'
import SetPasswordForm from './SetPasswordForm'

export const metadata = { title: 'Set your password — Tui Media' }

export default async function PortalSetupPage() {
  // Reachable only with the session the emailed link just created. Without it
  // there is nothing to set a password on.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login?error=expired')

  return (
    <PortalAuthShell
      title="Choose a password"
      intro={`You're setting up the account for ${user.email}.`}
    >
      <SetPasswordForm />
    </PortalAuthShell>
  )
}
