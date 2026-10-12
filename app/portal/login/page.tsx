import PortalAuthShell from '../PortalAuthShell'
import PortalLoginForm from './PortalLoginForm'

export const metadata = { title: 'Sign in — Tui Media' }

const MESSAGES: Record<string, string> = {
  expired: 'That link has expired or was already used. Use “Forgot your password?” below to get a fresh one.',
  account: 'That login isn’t linked to a client portal. Email hello@tuimedia.nz and we’ll sort it out.',
}

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const notice = error ? MESSAGES[error] ?? null : null

  return (
    <PortalAuthShell title="Sign in" intro="Access your projects, files and paperwork.">
      <PortalLoginForm notice={notice} />
    </PortalAuthShell>
  )
}
